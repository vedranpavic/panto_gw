import { config } from './config.js'
import { searchIssues, getIssuesByKeys } from './jiraClient.js'

const BASE_FIELDS = ['summary', 'status', 'issuelinks', 'issuetype']

const fieldList = () => {
  const fields = [...BASE_FIELDS, 'flagged']
  if (config.jira.fields.businessValue) fields.push(config.jira.fields.businessValue)
  if (config.jira.fields.team) fields.push(config.jira.fields.team)
  return fields
}

// Issue links carry a partial representation of the linked issue (key, summary,
// status, issuetype) but not custom fields, and Jira doesn't tell us which side
// of the link is "ours", so we check both directions.
const linkedIssueKeys = (issue, wantedIssueType) => {
  const links = issue.fields.issuelinks || []
  const keys = []

  for (const link of links) {
    const typeName = link.type?.name || ''
    if (typeName.toLowerCase() !== config.jira.hierarchyLinkType.toLowerCase()) continue

    const other = link.outwardIssue || link.inwardIssue
    if (!other) continue
    if (other.fields?.issuetype?.name?.toLowerCase() !== wantedIssueType.toLowerCase()) continue

    keys.push(other.key)
  }

  return keys
}

const readBusinessValue = (issue) => {
  const raw = config.jira.fields.businessValue ? issue.fields[config.jira.fields.businessValue] : null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

const readTeam = (issue) => {
  const raw = config.jira.fields.team ? issue.fields[config.jira.fields.team] : null
  if (!raw) return 'Onbekend team'
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0]?.value || raw[0]?.name || 'Onbekend team'
  return raw.value || raw.name || 'Onbekend team'
}

const isDone = (issue) => issue.fields.status?.statusCategory?.key === 'done'

const needsAttention = (issue) => {
  if (issue.fields.flagged) return true
  const statusName = (issue.fields.status?.name || '').toLowerCase()
  return config.jira.attentionStatuses.some((s) => s.toLowerCase() === statusName)
}

const statusLabel = (issue) => {
  if (needsAttention(issue)) return 'Needs Attention'
  if (isDone(issue)) return 'Done'
  return 'On Track'
}

async function buildFeature(issue) {
  const storyJql = `${config.jira.storyParentField} = ${issue.key}`
  const stories = await searchIssues(storyJql, ['status'])

  return {
    id: issue.id,
    title: issue.fields.summary,
    jiraKey: issue.key,
    team: readTeam(issue),
    status: statusLabel(issue),
    hasRisk: needsAttention(issue),
    completedStories: stories.filter(isDone).length,
    totalStories: stories.length,
  }
}

async function buildObjective(issue) {
  const featureKeys = linkedIssueKeys(issue, config.jira.featureIssueType)
  const featureIssues = await getIssuesByKeys(featureKeys, fieldList())
  const features = await Promise.all(featureIssues.map(buildFeature))

  return {
    id: issue.id,
    title: issue.fields.summary,
    businessValue: readBusinessValue(issue),
    features,
  }
}

async function buildEpic(issue) {
  const objectiveKeys = linkedIssueKeys(issue, config.jira.objectiveIssueType)
  const objectiveIssues = await getIssuesByKeys(objectiveKeys, fieldList())
  const objectives = await Promise.all(objectiveIssues.map(buildObjective))

  return {
    id: issue.id,
    title: issue.fields.summary,
    jiraKey: issue.key,
    objectives,
  }
}

export async function fetchHierarchy() {
  const epicIssues = await searchIssues(config.jira.epicJql, fieldList())
  return Promise.all(epicIssues.map(buildEpic))
}
