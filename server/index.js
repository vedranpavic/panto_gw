import express from 'express'
import cors from 'cors'
import { config, isJiraConfigured, isRteConfigured } from './config.js'
import { fetchHierarchy } from './hierarchy.js'
import { readPublishedExcelData, writePublishedExcelData } from './excelStore.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' })) // Excel-exports kunnen duizenden features bevatten

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

// ---- RTE-modus: login + gedeelde Excel-publicatie ----

app.post('/api/rte/login', (req, res) => {
  if (!isRteConfigured()) {
    return res.status(503).json({ error: 'rte_not_configured', message: 'RTE_PASSWORD is niet ingesteld. Zie .env.example.' })
  }
  const { password } = req.body || {}
  if (password !== config.rtePassword) {
    return res.status(401).json({ error: 'invalid_password', message: 'Onjuist wachtwoord.' })
  }
  res.json({ ok: true })
})

const requireRte = (req, res, next) => {
  if (!isRteConfigured()) {
    return res.status(503).json({ error: 'rte_not_configured', message: 'RTE_PASSWORD is niet ingesteld. Zie .env.example.' })
  }
  if (req.get('X-RTE-Password') !== config.rtePassword) {
    return res.status(401).json({ error: 'unauthorized', message: 'Onjuist of ontbrekend RTE-wachtwoord.' })
  }
  next()
}

app.get('/api/excel-data', (req, res) => {
  const published = readPublishedExcelData()
  if (!published) {
    return res.status(404).json({ error: 'not_published', message: 'Nog geen Excel-data gepubliceerd door een RTE.' })
  }
  res.json(published)
})

app.post('/api/excel-data', requireRte, (req, res) => {
  const { teams } = req.body || {}
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'invalid_body', message: '"teams" moet een array zijn.' })
  }
  try {
    const published = writePublishedExcelData(teams)
    res.json({ ok: true, ...published })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'publish_failed', message: err.message })
  }
})

app.listen(config.port, () => {
  console.log(`Jira API bridge listening on http://localhost:${config.port}`)
  if (!isJiraConfigured()) {
    console.warn('Jira credentials missing — copy .env.example to .env and fill them in.')
  }
  if (!isRteConfigured()) {
    console.warn('RTE_PASSWORD missing — RTE-modus login zal altijd falen tot dit is ingesteld.')
  }
})
