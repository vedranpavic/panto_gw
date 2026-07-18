import 'dotenv/config'

const required = (name) => {
  const value = process.env[name]
  if (!value) return null
  return value
}

const list = (name, fallback) => {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export const config = {
  // Deliberately not named PORT: some dev/preview environments already
  // export PORT for the frontend dev server, which would otherwise leak in here.
  port: Number(process.env.API_PORT) || 8787,

  jira: {
    baseUrl: required('JIRA_BASE_URL'), // e.g. https://your-domain.atlassian.net
    email: required('JIRA_EMAIL'),
    apiToken: required('JIRA_API_TOKEN'),

    // JQL that selects the Epics shown on the dashboard.
    epicJql: process.env.JIRA_EPIC_JQL || 'issuetype = Epic ORDER BY created DESC',

    // Issue type names as configured in your Jira instance.
    objectiveIssueType: process.env.JIRA_OBJECTIVE_ISSUE_TYPE || 'Objective',
    featureIssueType: process.env.JIRA_FEATURE_ISSUE_TYPE || 'Feature',

    // Name of the issue link type connecting Epic -> Objective -> Feature
    // (the "Implements" / "Implemented by" link pair). Matched case-insensitively
    // and checked in both link directions, so it doesn't matter which side
    // "implements" which.
    hierarchyLinkType: process.env.JIRA_HIERARCHY_LINK_TYPE || 'Implements',

    // Field used to find a Feature's child Stories. Defaults to the modern
    // Jira "parent" field (Advanced Roadmaps custom hierarchy levels use this).
    // Set to "Epic Link" if your Stories use the classic epic-link field instead.
    storyParentField: process.env.JIRA_STORY_PARENT_FIELD || 'parent',

    // Custom field IDs — find these via
    // https://your-domain.atlassian.net/rest/api/3/field
    fields: {
      businessValue: process.env.JIRA_FIELD_BUSINESS_VALUE || null,
      team: process.env.JIRA_FIELD_TEAM || null,
    },

    // Status names (case-insensitive) that should surface as "Needs Attention"
    // regardless of the issue's status category. Combined with Jira's built-in
    // "flagged" (impediment) indicator when present.
    attentionStatuses: list('JIRA_ATTENTION_STATUSES', ['Blocked', 'At Risk', 'Impediment']),
  },

  // How long a fetched hierarchy is cached in memory before Jira is hit again.
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 120_000,
}

export const isJiraConfigured = () =>
  Boolean(config.jira.baseUrl && config.jira.email && config.jira.apiToken)
