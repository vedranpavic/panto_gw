import { config } from './config.js'

const authHeader = () =>
  'Basic ' + Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64')

async function jiraFetch(path, options = {}) {
  const res = await fetch(`${config.jira.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Jira API ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 500)}`)
  }

  return res.json()
}

// Runs a JQL search, paging through all results, requesting the given fields.
export async function searchIssues(jql, fields) {
  const issues = []
  let startAt = 0
  const maxResults = 100

  while (true) {
    const page = await jiraFetch('/rest/api/3/search', {
      method: 'POST',
      body: JSON.stringify({ jql, fields, startAt, maxResults }),
    })

    issues.push(...page.issues)

    if (startAt + page.issues.length >= page.total || page.issues.length === 0) break
    startAt += maxResults
  }

  return issues
}

// Fetches full issues (with the requested fields) for a set of issue keys.
export async function getIssuesByKeys(keys, fields) {
  if (keys.length === 0) return []
  const uniqueKeys = [...new Set(keys)]
  return searchIssues(`key in (${uniqueKeys.join(',')})`, fields)
}
