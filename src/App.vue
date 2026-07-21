<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import * as XLSX from 'xlsx'
import allianderLogo from './assets/alliander-logo.webp'

const demoData = [
  {
    id: 1,
    title: "[SW] - Discovery integratie PlaNRG",
    jiraKey: "EPIC-402",
    objectives: [
      {
        id: 101,
        title: "Voor de projectmanagers, engineers, OIV-ers en aannemers binnen LS Buurtaanpak willen we de implementatie van Systems Engineering en toepassing van Relatics op de projecten realiseren, zodat de FTR bij opleveringen wordt verhoogd.",
        businessValue: 9,
        features: [
          { id: 1001, title: "[SW] - Discovery integratie PlaNRG", jiraKey: "FEAT-891", team: "Team ANO SW", status: "On Track", completedStories: 6, totalStories: 8, hasRisk: false },
          { id: 1002, title: "SW: Digitalisering beleid nieuwe stations", jiraKey: "FEAT-892", team: "Team Alpha (Identity)", status: "Done", completedStories: 12, totalStories: 12, hasRisk: false },
          { id: 1003, title: "Notificatie-engine voor profielwijzigingen", jiraKey: "FEAT-904", team: "Team ANO SW", status: "Needs Attention", completedStories: 2, totalStories: 5, hasRisk: true }
        ]
      },
      {
        id: 102,
        title: "Voor de projectmanagers, technisch managers, engineers en ingenieursbureau Stantec binnen SW Specials willen we de implementatie van Systems Engineering en toepassing van Relatics op het programma realiseren, zodat de FTR bij oplevering wordt verhoogd.",
        businessValue: 8,
        features: [
          { id: 1004, title: "API-Caching & Data-Anonymisering Module", jiraKey: "FEAT-911", team: "Team ANO SW", status: "On Track", completedStories: 4, totalStories: 10, hasRisk: false }
        ]
      }
    ]
  }
]

const hierarchyData = ref(demoData)
const teamData = ref([]) // Excel-view: Team -> Epic -> Features (geen Objective-laag)
const dataSource = ref('demo') // 'demo' | 'live' | 'excel'
const isLoading = ref(false)
const errorMessage = ref('')

// Databron-schakelaar: Jira-koppeling is nog niet vrijgegeven door management,
// dus tot die tijd draait het dashboard op een handmatig geüpload Excel-bestand.
const sourceMode = ref('excel') // 'jira' | 'excel'
const SOURCE_MODE_STORAGE_KEY = 'art-dashboard-source-mode'

const isDark = ref(false)
const DARK_MODE_STORAGE_KEY = 'art-dashboard-dark-mode'

const applyDarkClass = () => {
  document.documentElement.classList.toggle('dark', isDark.value)
}

const toggleDarkMode = () => {
  isDark.value = !isDark.value
  try { localStorage.setItem(DARK_MODE_STORAGE_KEY, isDark.value ? 'dark' : 'light') } catch { /* ignore */ }
  applyDarkClass()
}

// ---- RTE-modus: het Excel-uploadpaneel is een geavanceerde instelling,
// alleen zichtbaar voor RTE's/scrum masters. Zij publiceren de data naar de
// server zodat iedereen (read-only) hetzelfde gepubliceerde overzicht ziet,
// ongeacht welke browser/laptop ze gebruiken.
const RTE_ACTIVE_STORAGE_KEY = 'art-dashboard-rte-active'
const RTE_SECRET_STORAGE_KEY = 'art-dashboard-rte-secret'

const isRte = ref(false)
const rtePassword = ref('')
const showRteLogin = ref(false)
const rtePasswordInput = ref('')
const rteLoginError = ref('')
const rteLoginLoading = ref(false)
const excelPublishError = ref('')
const excelPublishedAt = ref(null)

const loginRte = async () => {
  rteLoginError.value = ''
  rteLoginLoading.value = true
  try {
    const res = await fetch('/api/rte/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: rtePasswordInput.value }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.message || 'Onjuist wachtwoord.')

    isRte.value = true
    rtePassword.value = rtePasswordInput.value
    rtePasswordInput.value = ''
    showRteLogin.value = false
    try {
      localStorage.setItem(RTE_ACTIVE_STORAGE_KEY, 'true')
      localStorage.setItem(RTE_SECRET_STORAGE_KEY, rtePassword.value)
    } catch { /* ignore */ }
  } catch (err) {
    rteLoginError.value = err.message
  } finally {
    rteLoginLoading.value = false
  }
}

const logoutRte = () => {
  isRte.value = false
  try { localStorage.setItem(RTE_ACTIVE_STORAGE_KEY, 'false') } catch { /* ignore */ }
}

const openEpics = ref([1])
const openObjectives = ref([101, 102])
const openTeams = ref([])

const toggleEpic = (id) => {
  if (openEpics.value.includes(id)) {
    openEpics.value = openEpics.value.filter(eId => eId !== id)
  } else {
    openEpics.value.push(id)
  }
}

const toggleObjective = (id) => {
  if (openObjectives.value.includes(id)) {
    openObjectives.value = openObjectives.value.filter(oId => oId !== id)
  } else {
    openObjectives.value.push(id)
  }
}

const toggleTeam = (name) => {
  if (openTeams.value.includes(name)) {
    openTeams.value = openTeams.value.filter(t => t !== name)
  } else {
    openTeams.value.push(name)
  }
}

const expandAll = () => {
  if (dataSource.value === 'excel') {
    openTeams.value = teamData.value.map(t => t.name)
    openEpics.value = teamData.value.flatMap(t => t.epics.map(e => e.id))
  } else {
    openEpics.value = hierarchyData.value.map(e => e.id)
    openObjectives.value = hierarchyData.value.flatMap(e => e.objectives.map(o => o.id))
  }
}

const collapseAll = () => {
  openTeams.value = []
  openEpics.value = []
  openObjectives.value = []
}

const loadHierarchy = async (forceRefresh = false) => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const res = await fetch(`/api/hierarchy${forceRefresh ? '?refresh=true' : ''}`)
    const body = await res.json()
    if (!res.ok) throw new Error(body.message || `Jira-koppeling gaf status ${res.status}`)

    hierarchyData.value = body.epics
    dataSource.value = 'live'
    expandAll()
  } catch (err) {
    errorMessage.value = err.message
    dataSource.value = 'demo'
    hierarchyData.value = demoData
  } finally {
    isLoading.value = false
  }
}

// ---- Excel-databron (tijdelijk, tot de Jira-koppeling vrijgegeven is) ----

const EXCEL_STORAGE_KEY = 'art-dashboard-excel-v1'

// Geen Objective-laag: de Excel heeft (nog) geen betrouwbare koppeling
// tussen Objective en Feature, dus het dashboard groepeert in Excel-modus
// per Team -> Epic -> Features.
// Afgeronde/totaal stories zijn optioneel: sommige exports (zoals Alliander's
// "Bdata Feature" rapportage) hebben geen story-splitsing per feature, enkel
// een status per rij. In dat geval telt elke feature als 1 eenheid.
const MAPPING_FIELD_DEFS = [
  { key: 'epicTitle', label: 'Epic titel', required: true },
  { key: 'epicKey', label: 'Epic key', required: false },
  { key: 'featureTitle', label: 'Feature titel', required: true },
  { key: 'featureKey', label: 'Feature key', required: false },
  { key: 'team', label: 'Team', required: true },
  { key: 'status', label: 'Status', required: true },
  { key: 'completed', label: 'Afgeronde stories (optioneel)', required: false },
  { key: 'total', label: 'Totaal stories (optioneel)', required: false },
  { key: 'risk', label: 'Risico-indicator', required: false },
  { key: 'toelichting', label: 'Toelichting risico (optioneel)', required: false },
]

// Keywords bevatten ook de exacte kolomnamen uit Alliander's "Bdata Feature"-
// rapportage (incl. de typo "Featute_titel"), zodat die sheet zonder
// handmatige koppeling direct goed wordt herkend.
const GUESS_RULES = {
  epicTitle: ['epic_titel', 'epic titel', 'epic title', 'epic naam', 'epic'],
  epicKey: ['epic_nr', 'epic nr', 'epic key', 'epic id', 'epic sleutel'],
  featureTitle: ['featute_titel', 'feature_titel', 'feature titel', 'feature title', 'feature naam', 'feature'],
  featureKey: ['feature_nr', 'feature nr', 'feature key', 'feature id', 'jira key', 'issue key'],
  team: ['team'],
  status: ['final_status_vg', 'final status vg', 'status'],
  completed: ['afgeronde stories', 'afgerond', 'gereed', 'done stories', 'completed'],
  total: ['totaal stories', 'totaal', 'aantal stories', 'total'],
  risk: ['impediments', 'impediment', 'risico', 'risk', 'geblokkeerd', 'flag'],
  toelichting: ['toelichting', 'reden', 'explanation'],
}

const DONE_KEYWORDS = ['done', 'klaar', 'afgerond', 'gereed']
const ON_TRACK_KEYWORDS = ['on track', 'ontrack', 'execution', 'implementing', 'in progress', 'actief']
const ATTENTION_KEYWORDS = ['attention', 'risk', 'risico', 'blocked', 'geblokkeerd', 'aandacht']
const CANCELLED_KEYWORDS = ['cancel', "won't do", 'wont do', 'geannuleerd', 'gearchiveerd', 'archived']
const TRUE_KEYWORDS = ['true', 'ja', 'yes', 'x', '1', 'waar']
const OFF_TRACK_KEYWORDS = ['off-track', 'off track', '🟥', '🔴']

const excelFileName = ref('')
const excelHeaders = ref([])
const excelRows = ref([])
const excelMapping = ref({})
const excelError = ref('')
const excelCancelledCount = ref(0)

// Inklapbaar Excel-configuratiepaneel (RTE-modus): eenmaal ingesteld hoeft
// een RTE dit niet steeds open te laten staan terwijl ze het dashboard bekijken.
const EXCEL_PANEL_STORAGE_KEY = 'art-dashboard-excel-panel-open'
const showExcelConfig = ref(true)
watch(showExcelConfig, (value) => {
  try { localStorage.setItem(EXCEL_PANEL_STORAGE_KEY, String(value)) } catch { /* ignore */ }
})

const isMappingComplete = computed(() =>
  MAPPING_FIELD_DEFS.filter(f => f.required).every(f => excelMapping.value[f.key])
)

const normalizeHeader = (h) => String(h).toLowerCase().trim()

const autoGuessMapping = () => {
  const mapping = {}
  const headers = excelHeaders.value
  for (const [field, keywords] of Object.entries(GUESS_RULES)) {
    // Exacte match eerst (bv. "Team" i.p.v. "Team_code"), dan pas op substring.
    const exact = headers.find((h) => keywords.includes(normalizeHeader(h)))
    const partial = headers.find((h) => keywords.some((k) => normalizeHeader(h).includes(k)))
    mapping[field] = exact || partial || ''
  }
  excelMapping.value = mapping
}

const persistExcelState = () => {
  try {
    localStorage.setItem(EXCEL_STORAGE_KEY, JSON.stringify({
      fileName: excelFileName.value,
      headers: excelHeaders.value,
      rows: excelRows.value,
      mapping: excelMapping.value,
    }))
  } catch {
    // localStorage niet beschikbaar of vol — niet kritiek, gewoon negeren
  }
}

const restoreExcelState = () => {
  try {
    const raw = localStorage.getItem(EXCEL_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    excelFileName.value = parsed.fileName || ''
    excelHeaders.value = parsed.headers || []
    excelRows.value = parsed.rows || []
    excelMapping.value = parsed.mapping || {}
    return excelRows.value.length > 0
  } catch {
    return false
  }
}

// Herkent Alliander's "Bdata Feature"-rapportage (of gelijksoortige exports):
// die sheet bevat de schone, platte feature-per-rij data en wordt bij
// voorkeur gekozen boven het eerste tabblad.
const pickSheetName = (workbook) => {
  const preferred = workbook.SheetNames.find((n) => /bdata\s*feature/i.test(n))
  return preferred || workbook.SheetNames[0]
}

// Sommige exports hebben een dubbele headerrij (een generieke sjabloonrij,
// gevolgd door de echte kolomnamen). We zoeken de rij met "Epic_NR" of
// "Feature_NR" op en gebruiken die als header, in plaats van blind rij 1 te pakken.
const detectHeaderRowIndex = (sheet) => {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const normalized = grid[r].map((c) => String(c).trim().toLowerCase())
    if (normalized.includes('epic_nr') || normalized.includes('feature_nr')) return r
  }
  return 0
}

const handleExcelFile = async (file) => {
  excelError.value = ''
  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = pickSheetName(workbook)
    const sheet = workbook.Sheets[sheetName]
    const headerRow = detectHeaderRowIndex(sheet)
    const rows = XLSX.utils.sheet_to_json(sheet, { range: headerRow, defval: '' })
    if (rows.length === 0) throw new Error(`Geen rijen gevonden in tabblad "${sheetName}".`)

    excelHeaders.value = Object.keys(rows[0])
    excelRows.value = rows
    excelFileName.value = `${file.name} — tabblad "${sheetName}"`
    autoGuessMapping()
    persistExcelState()
  } catch (err) {
    excelError.value = `Kon bestand niet lezen: ${err.message}`
  }
}

const onExcelFileSelected = (event) => {
  const file = event.target.files?.[0]
  if (file) handleExcelFile(file)
  event.target.value = ''
}

const isTruthyRisk = (raw) => {
  if (typeof raw === 'boolean') return raw
  const s = String(raw ?? '').trim().toLowerCase()
  if (OFF_TRACK_KEYWORDS.some((k) => s.includes(k))) return true
  return TRUE_KEYWORDS.includes(s)
}

const isCancelledStatus = (raw) => {
  const s = String(raw ?? '').toLowerCase()
  return CANCELLED_KEYWORDS.some((k) => s.includes(k))
}

const normalizeStatus = (raw, hasRisk) => {
  if (hasRisk) return 'Needs Attention'
  const s = String(raw ?? '').toLowerCase()
  if (DONE_KEYWORDS.some((k) => s.includes(k))) return 'Done'
  if (ATTENTION_KEYWORDS.some((k) => s.includes(k))) return 'Needs Attention'
  if (ON_TRACK_KEYWORDS.some((k) => s.includes(k))) return 'On Track'
  return String(raw ?? '').trim() || 'On Track'
}

// Gepubliceerde Excel-data ophalen: dit is wat read-only gebruikers (en RTE's
// bij het openen van het dashboard) te zien krijgen — server-side gedeeld,
// dus onafhankelijk van welke browser/laptop iemand gebruikt.
const fetchPublishedExcelData = async () => {
  isLoading.value = true
  excelPublishError.value = ''
  try {
    const res = await fetch('/api/excel-data')
    const body = await res.json()

    if (res.status === 404 && body.error === 'not_published') {
      excelPublishError.value = 'not_published'
      teamData.value = []
      dataSource.value = 'demo'
      hierarchyData.value = demoData
      return
    }
    if (!res.ok) throw new Error(body.message || `Status ${res.status}`)

    teamData.value = body.teams
    excelPublishedAt.value = body.publishedAt
    dataSource.value = 'excel'
    errorMessage.value = ''
    openTeams.value = []
    openEpics.value = []
  } catch (err) {
    excelPublishError.value = err.message
    dataSource.value = 'demo'
    hierarchyData.value = demoData
  } finally {
    isLoading.value = false
  }
}

const publishExcelData = async (teams) => {
  try {
    const res = await fetch('/api/excel-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RTE-Password': rtePassword.value },
      body: JSON.stringify({ teams }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.message || `Status ${res.status}`)
    excelPublishedAt.value = body.publishedAt
    excelPublishError.value = ''
  } catch (err) {
    excelError.value = `Lokaal toegepast, maar publiceren voor de rest is mislukt: ${err.message}`
  }
}

const applyExcelMapping = async () => {
  excelError.value = ''
  if (!isMappingComplete.value) {
    excelError.value = 'Koppel eerst alle verplichte velden (*) voordat je het dashboard vult.'
    return
  }

  const m = excelMapping.value
  const teams = new Map()
  let cancelledCount = 0

  excelRows.value.forEach((row, idx) => {
    const epicTitle = String(row[m.epicTitle] ?? '').trim()
    const featureTitle = String(row[m.featureTitle] ?? '').trim()
    if (!epicTitle || !featureTitle) return

    // Geannuleerde/afgeblazen features horen niet in een voortgangsbeeld thuis.
    if (m.status && isCancelledStatus(row[m.status])) {
      cancelledCount++
      return
    }

    const teamName = String(row[m.team] ?? '').trim() || 'Onbekend team'
    const epicKey = m.epicKey ? String(row[m.epicKey] ?? '').trim() : ''
    const epicId = epicKey || epicTitle

    if (!teams.has(teamName)) {
      teams.set(teamName, { name: teamName, epics: new Map() })
    }
    const team = teams.get(teamName)

    if (!team.epics.has(epicId)) {
      team.epics.set(epicId, { id: `${teamName}::${epicId}`, title: epicTitle, jiraKey: epicKey, features: [] })
    }
    const epic = team.epics.get(epicId)

    const riskRaw = m.risk ? row[m.risk] : ''
    const hasRisk = isTruthyRisk(riskRaw)
    const status = normalizeStatus(row[m.status], hasRisk)

    // Geen story-splitsing beschikbaar (bv. Alliander's Bdata Feature-export)?
    // Dan telt elke feature als 1 eenheid: klaar (1/1) of nog niet (0/1).
    const completed = m.completed ? Number(row[m.completed]) || 0 : (status === 'Done' ? 1 : 0)
    const total = m.total ? Number(row[m.total]) || 0 : 1

    epic.features.push({
      id: `${epic.id}::${idx}`,
      title: featureTitle,
      jiraKey: m.featureKey ? String(row[m.featureKey] ?? '').trim() : '',
      status,
      completedStories: completed,
      totalStories: total,
      hasRisk: hasRisk || status === 'Needs Attention',
      toelichting: m.toelichting ? String(row[m.toelichting] ?? '').trim() : '',
    })
  })

  const result = [...teams.values()]
    .map((team) => ({
      ...team,
      epics: [...team.epics.values()].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (result.length === 0) {
    excelError.value = 'Geen geldige rijen gevonden met de huidige kolomkoppeling. Controleer de mapping.'
    return
  }

  teamData.value = result
  dataSource.value = 'excel'
  errorMessage.value = ''
  // Team-niveau is het overzicht; teams/epics starten ingeklapt zodat een
  // groot rapport (honderden features) niet meteen volledig openklapt.
  openTeams.value = []
  openEpics.value = []
  excelCancelledCount.value = cancelledCount
  persistExcelState()

  // RTE's publiceren meteen naar de server, zodat de rest (read-only) dit ook ziet.
  if (isRte.value) {
    await publishExcelData(result)
  }
}

watch(sourceMode, (mode) => {
  try { localStorage.setItem(SOURCE_MODE_STORAGE_KEY, mode) } catch { /* ignore */ }
  errorMessage.value = ''

  if (mode === 'jira') {
    loadHierarchy()
  } else {
    fetchPublishedExcelData()
  }
})

onMounted(() => {
  let storedDarkMode = null
  try { storedDarkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY) } catch { /* ignore */ }
  if (storedDarkMode === 'dark' || (!storedDarkMode && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDark.value = true
  }
  applyDarkClass()

  try {
    const storedPanelOpen = localStorage.getItem(EXCEL_PANEL_STORAGE_KEY)
    if (storedPanelOpen !== null) showExcelConfig.value = storedPanelOpen === 'true'
  } catch { /* ignore */ }

  try {
    if (localStorage.getItem(RTE_ACTIVE_STORAGE_KEY) === 'true') {
      isRte.value = true
      rtePassword.value = localStorage.getItem(RTE_SECRET_STORAGE_KEY) || ''
    }
  } catch { /* ignore */ }

  // Alleen voor RTE's relevant: hun laatst gebruikte bestand/kolomkoppeling,
  // zodat ze niet opnieuw hoeven te uploaden om een update te publiceren.
  restoreExcelState()

  let storedMode = null
  try { storedMode = localStorage.getItem(SOURCE_MODE_STORAGE_KEY) } catch { /* ignore */ }
  if (storedMode === 'jira' || storedMode === 'excel') sourceMode.value = storedMode

  if (sourceMode.value === 'jira') {
    loadHierarchy()
  } else {
    fetchPublishedExcelData()
  }
})

const getStatusClass = (status) => {
  switch (status) {
    case 'Done': return 'status-done text-emerald-700 border border-emerald-200 dark:text-emerald-300 dark:border-emerald-800'
    case 'On Track': return 'status-ontrack text-blue-700 border border-blue-200 dark:text-blue-300 dark:border-blue-800'
    case 'Needs Attention': return 'status-attention text-amber-700 border border-amber-200 dark:text-amber-300 dark:border-amber-800'
    default: return 'bg-gray-50 text-gray-600 border border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  }
}

const ALMOST_DONE_THRESHOLD = 0.75

const isAlmostDone = (feature) => {
  if (feature.status === 'Done') return false
  return feature.completedStories / feature.totalStories >= ALMOST_DONE_THRESHOLD
}

const calculateProgress = (epic) => {
  let total = 0
  let completed = 0
  epic.objectives.forEach(obj => {
    obj.features.forEach(feat => {
      total += feat.totalStories
      completed += feat.completedStories
    })
  })
  return total === 0 ? 0 : Math.round((completed / total) * 100)
}

const calculateEpicFeatureProgress = (epic) => {
  const total = epic.features.reduce((sum, f) => sum + f.totalStories, 0)
  const completed = epic.features.reduce((sum, f) => sum + f.completedStories, 0)
  return total === 0 ? 0 : Math.round((completed / total) * 100)
}

const JIRA_BROWSE_BASE_URL = 'https://alliander.atlassian.net/browse/'
const jiraIssueUrl = (key) => (key ? `${JIRA_BROWSE_BASE_URL}${key}` : '')

const teamFeatureCount = (team) => team.epics.reduce((sum, e) => sum + e.features.length, 0)

const calculateTeamProgress = (team) => {
  let total = 0
  let completed = 0
  team.epics.forEach(epic => {
    epic.features.forEach(feat => {
      total += feat.totalStories
      completed += feat.completedStories
    })
  })
  return total === 0 ? 0 : Math.round((completed / total) * 100)
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto bg-gray-50 dark:bg-slate-950 min-h-screen font-sans antialiased text-slate-800 dark:text-slate-100 transition-colors duration-300">

    <!-- Top Header -->
    <div class="mb-8 pb-5 border-b border-gray-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
      <div class="flex items-center gap-5">
        <img :src="allianderLogo" alt="Alliander" class="h-16 w-auto rounded-md shadow-sm" />
        <div class="h-11 w-px bg-gray-300 dark:bg-slate-700"></div>
        <div class="flex items-center gap-2.5">
          <svg
            viewBox="0 0 40 40"
            class="h-9 w-9 shrink-0 transition-colors duration-300"
            :class="dataSource === 'live'
              ? 'alliander-text pantograph-live'
              : sourceMode === 'jira'
                ? 'text-red-500 dark:text-red-400'
                : 'text-slate-400 dark:text-slate-500'"
            fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            :title="dataSource === 'live' ? 'Live verbonden met Jira' : sourceMode === 'jira' ? 'Geen actieve verbinding' : 'Excel-modus actief'"
          >
            <!-- bovenleiding -->
            <line x1="4" y1="7" x2="36" y2="7" />
            <!-- pantograaf-armen -->
            <line x1="20" y1="7" x2="9" y2="30" />
            <line x1="20" y1="7" x2="31" y2="30" />
            <!-- scharnier -->
            <line x1="13.5" y1="18.5" x2="26.5" y2="18.5" />
            <!-- treindak -->
            <line x1="6" y1="33" x2="34" y2="33" />
            <!-- contactpunt -->
            <circle cx="20" cy="7" r="2.2" fill="currentColor" stroke="none" class="pantograph-contact" />
          </svg>
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
              Panto<span class="alliander-text">.</span>
            </h1>
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mt-1.5">
              <span>Agile Release Train</span>
              <span>•</span>
              <span class="alliander-text font-bold">Grote Werkpakketten</span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 w-full sm:w-auto self-stretch sm:self-auto justify-end flex-wrap">

        <!-- Instellingen -->
        <div class="flex items-center gap-1.5">
          <button
            @click="toggleDarkMode"
            :title="isDark ? 'Lichte modus' : 'Donkere modus'"
            :aria-label="isDark ? 'Lichte modus' : 'Donkere modus'"
            class="h-8 w-8 inline-flex items-center justify-center bg-white border border-gray-300 rounded-md shadow-xs hover:bg-gray-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg v-if="isDark" viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1Z"/></svg>
            <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          </button>

          <!-- RTE-modus: geavanceerde instellingen (Excel-upload/publiceren) zijn
               alleen zichtbaar voor RTE's/scrum masters. Iedereen mag wel gewoon
               wisselen tussen Excel en Jira. -->
          <div class="relative">
            <button
              @click="isRte ? logoutRte() : (showRteLogin = !showRteLogin)"
              :title="isRte ? 'RTE-modus actief — klik om uit te loggen' : 'RTE-modus ontgrendelen'"
              class="h-8 text-xs font-semibold px-3 border rounded-md shadow-xs transition-colors inline-flex items-center gap-1.5"
              :class="isRte
                ? 'alliander-bg text-white border-transparent hover:opacity-90'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700'"
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 14c0-4.5 3-8 7-8s7 3.5 7 8" />
                <rect x="4" y="13" width="16" height="3.5" rx="1" fill="currentColor" stroke="none" />
                <path d="M2.5 17.5c3 1.8 16 1.8 19 0" />
                <circle cx="12" cy="14.7" r="1" fill="white" stroke="none" />
              </svg>
              RTE-modus
            </button>

            <div
              v-if="showRteLogin"
              class="absolute right-0 mt-2 w-64 z-20 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-3 text-left"
            >
              <label class="block text-[10px] font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">RTE-wachtwoord</label>
              <input
                v-model="rtePasswordInput"
                type="password"
                autofocus
                @keyup.enter="loginRte"
                class="w-full text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded px-2 py-1.5 mb-2"
                placeholder="Wachtwoord"
              />
              <div v-if="rteLoginError" class="text-[11px] text-red-600 dark:text-red-400 mb-2">{{ rteLoginError }}</div>
              <div class="flex gap-2">
                <button
                  @click="loginRte"
                  :disabled="rteLoginLoading"
                  class="flex-1 text-xs font-semibold px-2 py-1.5 alliander-bg text-white rounded-md shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {{ rteLoginLoading ? 'Bezig...' : 'Ontgrendelen' }}
                </button>
                <button
                  @click="showRteLogin = false; rteLoginError = ''"
                  class="text-xs font-semibold px-2 py-1.5 border border-gray-300 dark:border-slate-600 dark:text-slate-200 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-700"></div>

        <!-- Weergave-acties: subtiele ghost-iconknoppen, geen rand/achtergrond
             tot je hovert — dit zijn terloopse hulpacties, geen hoofdknoppen. -->
        <div class="flex items-center gap-0.5">
          <button
            v-if="sourceMode === 'jira'"
            @click="loadHierarchy(true)"
            :disabled="isLoading"
            title="Ververs Jira-data"
            aria-label="Ververs Jira-data"
            class="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" :class="{ 'animate-spin': isLoading }" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <button
            @click="expandAll"
            title="Alles uitklappen"
            aria-label="Alles uitklappen"
            class="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 8l5 5 5-5" />
              <path d="M7 15l5 5 5-5" />
            </svg>
          </button>
          <button
            @click="collapseAll"
            title="Alles inklappen"
            aria-label="Alles inklappen"
            class="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 16l5-5 5 5" />
              <path d="M7 9l5-5 5 5" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Databron-schakelaar -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Databron</span>
      <div class="inline-flex rounded-md border border-gray-300 bg-white p-0.5 shadow-xs dark:bg-slate-800 dark:border-slate-700">
        <button
          @click="sourceMode = 'excel'"
          class="text-xs font-semibold px-3 py-1 rounded transition-colors"
          :class="sourceMode === 'excel' ? 'alliander-bg text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700'"
        >
          Excel
        </button>
        <button
          @click="sourceMode = 'jira'"
          class="text-xs font-semibold px-3 py-1 rounded transition-colors"
          :class="sourceMode === 'jira' ? 'alliander-bg text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700'"
        >
          Jira (live)
        </button>
      </div>
      <div
        class="text-xs font-semibold border px-3 py-1 rounded-full inline-flex items-center gap-1.5"
        :class="{
          'status-ontrack text-blue-700 dark:text-blue-300': dataSource === 'live',
          'status-inprogress alliander-text': dataSource === 'excel',
          'bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700': dataSource === 'demo',
        }"
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="{ 'bg-blue-500': dataSource === 'live', 'alliander-bg': dataSource === 'excel', 'bg-gray-400': dataSource === 'demo' }"
        ></span>
        {{ dataSource === 'live' ? 'Live Jira-data' : dataSource === 'excel' ? 'Excel-data' : 'Demo-data' }}
      </div>
      <span class="text-xs text-gray-400 dark:text-slate-500">Jira-koppeling volgt zodra het API-token is vrijgegeven — tot die tijd vult Excel het dashboard.</span>
    </div>

    <!-- Excel-importpaneel: geavanceerde instelling, alleen voor RTE's -->
    <div v-if="sourceMode === 'excel' && isRte" class="mb-6 rounded-lg border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
      <div
        @click="showExcelConfig = !showExcelConfig"
        class="flex flex-wrap items-center justify-between gap-3 p-4 cursor-pointer select-none hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors"
        :class="showExcelConfig ? 'border-b border-gray-100 dark:border-slate-800' : ''"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <svg
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500 transition-transform duration-200"
            :class="showExcelConfig ? 'rotate-90' : ''"
            fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          ><path d="M9 6l6 6-6 6" /></svg>
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 shrink-0">Excel-configuratie</span>
          <span v-if="!showExcelConfig" class="text-xs text-slate-500 dark:text-slate-400 truncate">
            <span v-if="excelFileName">{{ excelFileName }}</span>
            <span v-else>Nog geen Excel-bestand gekozen</span>
          </span>
        </div>
        <span v-if="!showExcelConfig && dataSource === 'excel' && excelPublishedAt" class="text-xs text-gray-400 dark:text-slate-500 shrink-0">
          Gepubliceerd op {{ new Date(excelPublishedAt).toLocaleString('nl-NL') }}
        </span>
      </div>

      <div v-show="showExcelConfig" class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs text-slate-600 dark:text-slate-400">
            <span v-if="excelFileName">Bestand: <span class="font-semibold text-slate-800 dark:text-slate-200">{{ excelFileName }}</span> ({{ excelRows.length }} rijen)</span>
            <span v-else>Nog geen Excel-bestand gekozen.</span>
          </div>
          <label class="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-xs hover:bg-gray-50 transition-colors cursor-pointer dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700">
            {{ excelFileName ? 'Ander bestand kiezen' : 'Bestand kiezen (.xlsx)' }}
            <input type="file" accept=".xlsx,.xls" class="hidden" @change="onExcelFileSelected" />
          </label>
        </div>

        <div v-if="excelError" class="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{{ excelError }}</div>
        <div v-if="dataSource === 'excel' && excelCancelledCount > 0" class="mt-2 text-xs text-gray-400 dark:text-slate-500">
          {{ excelCancelledCount }} geannuleerde feature(s) overgeslagen (niet meegeteld in de voortgang).
        </div>
        <div v-if="dataSource === 'excel' && excelPublishedAt" class="mt-2 text-xs text-gray-400 dark:text-slate-500">
          Gepubliceerd voor iedereen op {{ new Date(excelPublishedAt).toLocaleString('nl-NL') }}.
        </div>

        <div v-if="excelHeaders.length > 0" class="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
          <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">Kolommen koppelen</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div v-for="field in MAPPING_FIELD_DEFS" :key="field.key">
              <label class="block text-[10px] font-semibold text-gray-500 dark:text-slate-400 mb-1">
                {{ field.label }}<span v-if="field.required" class="text-red-500"> *</span>
              </label>
              <select v-model="excelMapping[field.key]" class="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <option value="">— geen —</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
          <button
            @click="applyExcelMapping"
            :disabled="!isMappingComplete"
            class="mt-4 text-xs font-semibold px-3 py-1.5 alliander-bg text-white rounded-md shadow-xs hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Publiceren voor iedereen
          </button>
        </div>
      </div>
    </div>

    <!-- Read-only gebruikers: geen configuratie, alleen duiding waar de data vandaan komt -->
    <div
      v-if="sourceMode === 'excel' && !isRte && excelPublishError === 'not_published'"
      class="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-xs text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
    >
      Nog geen Excel-data gepubliceerd. Vraag een RTE of scrum master om een bestand te uploaden via RTE-modus.
    </div>
    <div
      v-else-if="sourceMode === 'excel' && !isRte && dataSource === 'excel' && excelPublishedAt"
      class="mb-6 text-xs text-gray-400 dark:text-slate-500"
    >
      Laatst gepubliceerd op {{ new Date(excelPublishedAt).toLocaleString('nl-NL') }}.
    </div>
    <div
      v-if="sourceMode === 'excel' && excelPublishError && excelPublishError !== 'not_published'"
      class="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <span>Kon geen gepubliceerde Excel-data ophalen ({{ excelPublishError }}) — demo-data getoond.</span>
      <button @click="fetchPublishedExcelData" class="font-semibold underline whitespace-nowrap shrink-0">Opnieuw proberen</button>
    </div>

    <!-- Foutmelding bij mislukte Jira-koppeling -->
    <div v-if="errorMessage" class="mb-6 -mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <span>Kon geen live Jira-data ophalen ({{ errorMessage }}) — demo-data getoond.</span>
      <button @click="loadHierarchy(true)" class="font-semibold underline whitespace-nowrap shrink-0">Opnieuw proberen</button>
    </div>

    <!-- Team-weergave (Excel): Team -> Epic -> Features, geen Objective-laag -->
    <div v-if="dataSource === 'excel'">
      <div v-for="team in teamData" :key="team.name" class="mb-10">

        <!-- Team Header -->
        <div @click="toggleTeam(team.name)" class="flex items-center justify-between gap-3 mb-3 cursor-pointer select-none">
          <div class="flex items-center gap-3">
            <svg
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500 transition-transform duration-200"
              :class="openTeams.includes(team.name) ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            ><path d="M9 6l6 6-6 6" /></svg>
            <span class="text-[10px] font-bold bg-slate-700 text-white px-2 py-0.5 rounded tracking-wider uppercase">Team</span>
            <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight">{{ team.name }}</h2>
            <span class="text-xs text-gray-400 dark:text-slate-500 font-medium">({{ team.epics.length }} epics · {{ teamFeatureCount(team) }} features)</span>
          </div>
          <div class="text-sm font-bold text-slate-700 dark:text-slate-300">
            Voortgang: <span class="alliander-text">{{ calculateTeamProgress(team) }}%</span>
          </div>
        </div>

        <div v-show="openTeams.includes(team.name)" class="space-y-5 pl-4 border-l-2 border-gray-200 dark:border-slate-800 ml-1.5">
          <div v-for="epic in team.epics" :key="epic.id" class="border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white dark:bg-slate-900 dark:border-slate-800">

            <!-- Epic Header -->
            <div @click="toggleEpic(epic.id)" class="corporate-dark-bg p-5 text-white flex justify-between items-center cursor-pointer select-none hover:opacity-98 transition-opacity relative">
              <div class="flex items-center gap-3 z-10">
                <svg
                  viewBox="0 0 24 24"
                  class="h-3.5 w-3.5 shrink-0 text-emerald-400 transition-transform duration-200"
                  :class="openEpics.includes(epic.id) ? 'rotate-90' : ''"
                  fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                ><path d="M9 6l6 6-6 6" /></svg>
                <span class="text-[10px] font-bold alliander-bg text-white px-2 py-0.5 rounded tracking-wider uppercase">Epic</span>
                <span class="font-semibold text-lg tracking-tight text-white">{{ epic.title }}</span>
                <a
                  v-if="epic.jiraKey"
                  :href="jiraIssueUrl(epic.jiraKey)"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click.stop
                  class="text-slate-400 hover:text-emerald-400 text-xs font-mono underline decoration-dotted"
                >({{ epic.jiraKey }})</a>
              </div>

              <div class="text-sm font-bold text-white z-10 corporate-dark-bg px-3 py-1 border border-slate-700 rounded-md shadow-inner">
                Voortgang: <span class="text-emerald-400">{{ calculateEpicFeatureProgress(epic) }}%</span>
              </div>
            </div>

            <!-- Elektrische Stroombalk -->
            <div class="custom-cable-container" @click="toggleEpic(epic.id)">
              <div class="custom-cable-fill" :style="{ width: calculateEpicFeatureProgress(epic) + '%' }">
                <div class="custom-pulse-overlay"></div>
                <div class="custom-wire-glow"></div>
              </div>
            </div>

            <!-- Features Table -->
            <div v-show="openEpics.includes(epic.id)" class="p-4 bg-white dark:bg-slate-900 overflow-x-auto">
              <div class="rounded-lg border border-gray-200 dark:border-slate-800">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-gray-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th class="p-3 w-1/2">Feature</th>
                      <th class="p-3">Status</th>
                      <th class="p-3 text-right">Voortgang</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-slate-800">
                    <tr v-for="feature in epic.features" :key="feature.id" class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors" :class="{ 'almost-done-row': isAlmostDone(feature) }">
                      <td class="p-3">
                        <div class="font-bold text-slate-900 dark:text-white text-sm">{{ feature.title }}</div>
                        <a
                          v-if="feature.jiraKey"
                          :href="jiraIssueUrl(feature.jiraKey)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-slate-400 dark:text-slate-500 hover:text-emerald-500 font-mono mt-0.5 underline decoration-dotted inline-block"
                        >{{ feature.jiraKey }}</a>
                      </td>
                      <td class="p-3 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                          <span :class="getStatusClass(feature.status)" class="px-2.5 py-1 rounded-md font-semibold text-xs">
                            {{ feature.status }}
                          </span>
                          <span v-if="feature.hasRisk" class="relative flex h-2 w-2" :title="feature.toelichting || undefined">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        </div>
                      </td>
                      <td class="p-3 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-3">
                          <span v-if="isAlmostDone(feature)" class="almost-done-badge">⚡ Bijna klaar</span>
                          <span class="font-mono text-slate-600 dark:text-slate-400 font-bold">{{ feature.completedStories }}/{{ feature.totalStories }}</span>
                          <div class="h-2 w-20 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden inline-block border border-gray-200 dark:border-slate-700 relative">
                            <div
                              class="h-full bg-[#00B064] bar-shimmer-effect"
                              :class="{ 'bar-almost-done': isAlmostDone(feature) }"
                              :style="{ width: (feature.completedStories / feature.totalStories * 100) + '%' }"
                            >
                              <span v-if="isAlmostDone(feature)" class="spark-tip"></span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>

    <!-- Epic -> Objective -> Feature-weergave (Jira / demo) -->
    <div v-else>
      <div v-for="epic in hierarchyData" :key="epic.id" class="mb-8 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-md bg-white dark:bg-slate-900">

        <!-- Epic Header -->
        <div @click="toggleEpic(epic.id)" class="corporate-dark-bg p-5 text-white flex justify-between items-center cursor-pointer select-none hover:opacity-98 transition-opacity relative">
          <div class="flex items-center gap-3 z-10">
            <svg
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 shrink-0 text-emerald-400 transition-transform duration-200"
              :class="openEpics.includes(epic.id) ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            ><path d="M9 6l6 6-6 6" /></svg>
            <span class="text-[10px] font-bold alliander-bg text-white px-2 py-0.5 rounded tracking-wider uppercase">Epic</span>
            <span class="font-semibold text-lg tracking-tight text-white">{{ epic.title }}</span>
            <span class="text-slate-400 text-xs font-mono">({{ epic.jiraKey }})</span>
          </div>

          <div class="text-sm font-bold text-white z-10 corporate-dark-bg px-3 py-1 border border-slate-700 rounded-md shadow-inner">
            Voortgang: <span class="text-emerald-400">{{ calculateProgress(epic) }}%</span>
          </div>
        </div>

        <!-- Elektrische Stroombalk -->
        <div class="custom-cable-container" @click="toggleEpic(epic.id)">
          <div class="custom-cable-fill" :style="{ width: calculateProgress(epic) + '%' }">
            <div class="custom-pulse-overlay"></div>
            <div class="custom-wire-glow"></div>
          </div>
        </div>

        <!-- Objectives Sectie -->
        <div v-show="openEpics.includes(epic.id)" class="p-5 bg-slate-50/30 dark:bg-slate-900/30 space-y-6">
          <div v-for="objective in epic.objectives" :key="objective.id" class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">

            <!-- Objective Title -->
            <div @click="toggleObjective(objective.id)" class="p-4 bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 flex items-start justify-between gap-3 cursor-pointer select-none border-b border-gray-100 dark:border-slate-800">
              <div class="flex items-start gap-3">
                <svg
                  viewBox="0 0 24 24"
                  class="mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500 transition-transform duration-200"
                  :class="openObjectives.includes(objective.id) ? 'rotate-90' : ''"
                  fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                ><path d="M9 6l6 6-6 6" /></svg>
                <span class="text-[10px] font-bold status-inprogress alliander-text border px-2 py-0.5 rounded tracking-wider uppercase whitespace-nowrap">Objective</span>
                <h3 class="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">{{ objective.title }}</h3>
              </div>
              <div class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded whitespace-nowrap" @click.stop>
                <span>BV:</span>
                <span class="font-bold text-slate-700 dark:text-slate-200">{{ objective.businessValue }}</span>
              </div>
            </div>

            <!-- Features Table -->
            <div v-show="openObjectives.includes(objective.id)" class="p-4 bg-white dark:bg-slate-900 overflow-x-auto">
              <div class="rounded-lg border border-gray-200 dark:border-slate-800">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-gray-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th class="p-3 w-1/2">Feature</th>
                      <th class="p-3">Team</th>
                      <th class="p-3">Status</th>
                      <th class="p-3 text-right">Voortgang (Stories)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-slate-800">
                    <tr v-for="feature in objective.features" :key="feature.id" class="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors" :class="{ 'almost-done-row': isAlmostDone(feature) }">
                      <td class="p-3">
                        <div class="font-bold text-slate-900 dark:text-white text-sm">{{ feature.title }}</div>
                        <div class="text-slate-400 dark:text-slate-500 font-mono mt-0.5">{{ feature.jiraKey }}</div>
                      </td>
                      <td class="p-3 whitespace-nowrap">
                        <span class="alliander-bg text-white font-bold px-2.5 py-1 rounded-md text-xs" v-if="feature.team === 'Team ANO SW'">
                          {{ feature.team }}
                        </span>
                        <span class="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-md text-xs" v-else>
                          {{ feature.team }}
                        </span>
                      </td>
                      <td class="p-3 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                          <span :class="getStatusClass(feature.status)" class="px-2.5 py-1 rounded-md font-semibold text-xs">
                            {{ feature.status }}
                          </span>
                          <span v-if="feature.hasRisk" class="relative flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        </div>
                      </td>
                      <td class="p-3 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-3">
                          <span v-if="isAlmostDone(feature)" class="almost-done-badge">⚡ Bijna klaar</span>
                          <span class="font-mono text-slate-600 dark:text-slate-400 font-bold">{{ feature.completedStories }}/{{ feature.totalStories }}</span>
                          <div class="h-2 w-20 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden inline-block border border-gray-200 dark:border-slate-700 relative">
                            <div
                              class="h-full bg-[#00B064] bar-shimmer-effect"
                              :class="{ 'bar-almost-done': isAlmostDone(feature) }"
                              :style="{ width: (feature.completedStories / feature.totalStories * 100) + '%' }"
                            >
                              <span v-if="isAlmostDone(feature)" class="spark-tip"></span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style>
.alliander-bg { background-color: #00B064 !important; }
.alliander-text { color: #00B064 !important; }
.corporate-dark-bg { background-color: #111827 !important; }

.status-done { background-color: rgba(16, 185, 129, 0.1) !important; }
.status-ontrack { background-color: rgba(59, 130, 246, 0.1) !important; }
.status-attention { background-color: rgba(245, 158, 11, 0.1) !important; }
.status-inprogress { background-color: rgba(0, 176, 100, 0.1) !important; }

.dark .status-done { background-color: rgba(16, 185, 129, 0.18) !important; }
.dark .status-ontrack { background-color: rgba(59, 130, 246, 0.18) !important; }
.dark .status-attention { background-color: rgba(245, 158, 11, 0.18) !important; }
.dark .status-inprogress { background-color: rgba(0, 176, 100, 0.18) !important; }

.custom-cable-container {
  height: 6px !important;
  width: 100% !important;
  background-color: #0d1b2a !important;
  position: relative !important;
  overflow: hidden !important;
}

.custom-cable-fill {
  height: 100% !important;
  background-color: #00B064 !important;
  position: relative !important;
  box-shadow: 0 0 12px #34d399, 0 0 4px #00B064 !important;
  transition: width 0.8s ease-in-out !important;
}

.custom-pulse-overlay {
  position: absolute !important;
  inset: 0 !important;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.2) 40%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(255, 255, 255, 0.2) 60%,
    rgba(255, 255, 255, 0) 100%
  ) !important;
  background-size: 200% 100% !important;
  animation: pure-electricity 1.5s infinite linear !important;
}

.custom-wire-glow {
  position: absolute !important;
  top: 0 !important; left: 0 !important; right: 0 !important;
  height: 2px !important;
  background-color: #e0f2fe !important;
  opacity: 0.8 !important;
  animation: pure-pulse 2s infinite ease-in-out !important;
}

.bar-shimmer-effect {
  position: relative !important;
}

.bar-shimmer-effect::after {
  content: '' !important;
  position: absolute !important;
  inset: 0 !important;
  background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%) !important;
  animation: bar-move 2.5s infinite linear !important;
  background-size: 200% 100% !important;
}

@keyframes pure-electricity {
  0% { background-position: 150% 0; }
  100% { background-position: -150% 0; }
}

@keyframes pure-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.9; }
}

@keyframes bar-move {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Bijna opgeleverd: features op 75%+ voortgang krijgen een elektrische "laatste rechte lijn" */
.almost-done-row {
  animation: almost-done-row-pulse 2.2s ease-in-out infinite !important;
}

@keyframes almost-done-row-pulse {
  0%, 100% { background-color: rgba(0, 176, 100, 0.02); }
  50% { background-color: rgba(0, 176, 100, 0.1); }
}

.almost-done-badge {
  display: inline-flex !important;
  align-items: center !important;
  gap: 2px !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  padding: 2px 7px !important;
  border-radius: 9999px !important;
  color: white !important;
  background: linear-gradient(90deg, #00B064, #34d399, #00B064) !important;
  background-size: 200% 100% !important;
  animation: badge-shimmer 1.8s linear infinite, badge-glow 1.8s ease-in-out infinite !important;
}

@keyframes badge-shimmer {
  0% { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}

@keyframes badge-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(52, 211, 153, 0); }
  50% { box-shadow: 0 0 8px 2px rgba(52, 211, 153, 0.7); }
}

.bar-almost-done {
  animation: bar-almost-done-glow 1.4s ease-in-out infinite !important;
}

@keyframes bar-almost-done-glow {
  0%, 100% { filter: brightness(1) saturate(1); }
  50% { filter: brightness(1.4) saturate(1.3); }
}

.spark-tip {
  position: absolute !important;
  right: -2px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 6px !important;
  height: 6px !important;
  border-radius: 9999px !important;
  background-color: #fff9c4 !important;
  box-shadow: 0 0 4px 2px rgba(255, 249, 196, 0.95), 0 0 10px 4px rgba(0, 176, 100, 0.65) !important;
  animation: spark-tip-pulse 0.9s ease-in-out infinite !important;
}

@keyframes spark-tip-pulse {
  0%, 100% { opacity: 0.55; transform: translateY(-50%) scale(0.75); }
  50% { opacity: 1; transform: translateY(-50%) scale(1.4); }
}

/* Pantograaf-icoon: subtiele elektrische schok wanneer er echt live Jira-data binnenkomt */
.pantograph-live {
  animation: pantograph-shock 4s ease-in-out infinite !important;
}

@keyframes pantograph-shock {
  0%, 90%, 100% {
    filter: none;
  }
  92% {
    filter: drop-shadow(0 0 3px rgba(52, 211, 153, 0.9)) drop-shadow(0 0 7px rgba(0, 176, 100, 0.6));
  }
  93.5% {
    filter: none;
  }
  95% {
    filter: drop-shadow(0 0 5px rgba(52, 211, 153, 1)) drop-shadow(0 0 10px rgba(0, 176, 100, 0.8));
  }
  97% {
    filter: none;
  }
}

.pantograph-live .pantograph-contact {
  animation: pantograph-contact-spark 4s ease-in-out infinite !important;
  transform-origin: 20px 7px;
}

@keyframes pantograph-contact-spark {
  0%, 90%, 100% { opacity: 1; transform: scale(1); }
  92%, 95% { opacity: 1; transform: scale(1.6); }
  93.5%, 97% { opacity: 0.7; transform: scale(1); }
}
</style>
