import express from 'express'
import cors from 'cors'
import { config, isJiraConfigured } from './config.js'
import { fetchHierarchy } from './hierarchy.js'

const app = express()
app.use(cors())

let cache = { data: null, fetchedAt: 0 }

app.get('/api/hierarchy', async (req, res) => {
  if (!isJiraConfigured()) {
    return res.status(503).json({
      error: 'jira_not_configured',
      message: 'JIRA_BASE_URL, JIRA_EMAIL en JIRA_API_TOKEN zijn niet ingesteld. Zie .env.example.',
    })
  }

  const forceRefresh = req.query.refresh === 'true'
  const isFresh = Date.now() - cache.fetchedAt < config.cacheTtlMs

  if (!forceRefresh && cache.data && isFresh) {
    return res.json({ epics: cache.data, cached: true, fetchedAt: cache.fetchedAt })
  }

  try {
    const epics = await fetchHierarchy()
    cache = { data: epics, fetchedAt: Date.now() }
    res.json({ epics, cached: false, fetchedAt: cache.fetchedAt })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: 'jira_fetch_failed', message: err.message })
  }
})

app.listen(config.port, () => {
  console.log(`Jira API bridge listening on http://localhost:${config.port}`)
  if (!isJiraConfigured()) {
    console.warn('Jira credentials missing — copy .env.example to .env and fill them in.')
  }
})
