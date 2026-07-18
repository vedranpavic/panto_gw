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
const dataSource = ref('demo') // 'demo' | 'live' | 'excel'
const isLoading = ref(false)
const errorMessage = ref('')

// Databron-schakelaar: Jira-koppeling is nog niet vrijgegeven door management,
// dus tot die tijd draait het dashboard op een handmatig geüpload Excel-bestand.
const sourceMode = ref('excel') // 'jira' | 'excel'
const SOURCE_MODE_STORAGE_KEY = 'art-dashboard-source-mode'

const openEpics = ref([1])
const openObjectives = ref([101, 102])

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

const expandAll = () => {
  openEpics.value = hierarchyData.value.map(e => e.id)
  openObjectives.value = hierarchyData.value.flatMap(e => e.objectives.map(o => o.id))
}

const collapseAll = () => {
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

const MAPPING_FIELD_DEFS = [
  { key: 'epicTitle', label: 'Epic titel', required: true },
  { key: 'epicKey', label: 'Epic key', required: false },
  { key: 'objectiveTitle', label: 'Objective titel', required: true },
  { key: 'objectiveKey', label: 'Objective key', required: false },
  { key: 'businessValue', label: 'Business value', required: false },
  { key: 'featureTitle', label: 'Feature titel', required: true },
  { key: 'featureKey', label: 'Feature key', required: false },
  { key: 'team', label: 'Team', required: true },
  { key: 'status', label: 'Status', required: true },
  { key: 'completed', label: 'Afgeronde stories', required: true },
  { key: 'total', label: 'Totaal stories', required: true },
  { key: 'risk', label: 'Risico-indicator', required: false },
]

const GUESS_RULES = {
  epicTitle: ['epic titel', 'epic title', 'epic naam', 'epic'],
  epicKey: ['epic key', 'epic id', 'epic sleutel'],
  objectiveTitle: ['objective titel', 'objective title', 'doelstelling', 'objective'],
  objectiveKey: ['objective key', 'objective id'],
  businessValue: ['business value', 'bv'],
  featureTitle: ['feature titel', 'feature title', 'feature naam', 'feature'],
  featureKey: ['feature key', 'feature id', 'jira key', 'issue key'],
  team: ['team'],
  status: ['status'],
  completed: ['afgeronde stories', 'afgerond', 'gereed', 'done stories', 'completed'],
  total: ['totaal stories', 'totaal', 'aantal stories', 'total'],
  risk: ['risico', 'risk', 'geblokkeerd', 'flag'],
}

const DONE_KEYWORDS = ['done', 'klaar', 'afgerond', 'gereed']
const ATTENTION_KEYWORDS = ['attention', 'risk', 'risico', 'blocked', 'geblokkeerd', 'aandacht']
const TRUE_KEYWORDS = ['true', 'ja', 'yes', 'x', '1', 'waar']

const excelFileName = ref('')
const excelHeaders = ref([])
const excelRows = ref([])
const excelMapping = ref({})
const excelError = ref('')

const isMappingComplete = computed(() =>
  MAPPING_FIELD_DEFS.filter(f => f.required).every(f => excelMapping.value[f.key])
)

const normalizeHeader = (h) => String(h).toLowerCase().trim()

const autoGuessMapping = () => {
  const mapping = {}
  for (const [field, keywords] of Object.entries(GUESS_RULES)) {
    const match = excelHeaders.value.find((h) => {
      const nh = normalizeHeader(h)
      return keywords.some((k) => nh === k || nh.includes(k))
    })
    mapping[field] = match || ''
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

const handleExcelFile = async (file) => {
  excelError.value = ''
  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    if (rows.length === 0) throw new Error('Geen rijen gevonden in het eerste tabblad.')

    excelHeaders.value = Object.keys(rows[0])
    excelRows.value = rows
    excelFileName.value = file.name
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
  return TRUE_KEYWORDS.includes(String(raw ?? '').trim().toLowerCase())
}

const normalizeStatus = (raw, hasRisk) => {
  if (hasRisk) return 'Needs Attention'
  const s = String(raw ?? '').toLowerCase()
  if (DONE_KEYWORDS.some((k) => s.includes(k))) return 'Done'
  if (ATTENTION_KEYWORDS.some((k) => s.includes(k))) return 'Needs Attention'
  return String(raw ?? '').trim() || 'On Track'
}

const applyExcelMapping = () => {
  excelError.value = ''
  if (!isMappingComplete.value) {
    excelError.value = 'Koppel eerst alle verplichte velden (*) voordat je het dashboard vult.'
    return
  }

  const m = excelMapping.value
  const epics = new Map()

  excelRows.value.forEach((row, idx) => {
    const epicTitle = String(row[m.epicTitle] ?? '').trim()
    if (!epicTitle) return
    const epicKey = m.epicKey ? String(row[m.epicKey] ?? '').trim() : ''
    const epicId = epicKey || epicTitle
    if (!epics.has(epicId)) {
      epics.set(epicId, { id: epicId, title: epicTitle, jiraKey: epicKey, objectives: new Map() })
    }
    const epic = epics.get(epicId)

    const objectiveTitle = String(row[m.objectiveTitle] ?? '').trim()
    if (!objectiveTitle) return
    const objectiveKey = m.objectiveKey ? String(row[m.objectiveKey] ?? '').trim() : ''
    const objectiveId = objectiveKey || `${epicId}::${objectiveTitle}`
    if (!epic.objectives.has(objectiveId)) {
      const bv = m.businessValue ? Number(row[m.businessValue]) : 0
      epic.objectives.set(objectiveId, {
        id: objectiveId,
        title: objectiveTitle,
        businessValue: Number.isFinite(bv) ? bv : 0,
        features: [],
      })
    }
    const objective = epic.objectives.get(objectiveId)

    const featureTitle = String(row[m.featureTitle] ?? '').trim()
    if (!featureTitle) return
    const completed = Number(row[m.completed]) || 0
    const total = Number(row[m.total]) || 0
    const riskRaw = m.risk ? row[m.risk] : ''
    const hasRisk = isTruthyRisk(riskRaw)

    objective.features.push({
      id: `${objectiveId}::${idx}`,
      title: featureTitle,
      jiraKey: m.featureKey ? String(row[m.featureKey] ?? '').trim() : '',
      team: String(row[m.team] ?? '').trim() || 'Onbekend team',
      status: normalizeStatus(row[m.status], hasRisk),
      completedStories: completed,
      totalStories: total,
      hasRisk: hasRisk || normalizeStatus(row[m.status], hasRisk) === 'Needs Attention',
    })
  })

  const result = [...epics.values()].map((epic) => ({
    ...epic,
    objectives: [...epic.objectives.values()],
  }))

  if (result.length === 0) {
    excelError.value = 'Geen geldige rijen gevonden met de huidige kolomkoppeling. Controleer de mapping.'
    return
  }

  hierarchyData.value = result
  dataSource.value = 'excel'
  errorMessage.value = ''
  expandAll()
  persistExcelState()
}

watch(sourceMode, (mode) => {
  try { localStorage.setItem(SOURCE_MODE_STORAGE_KEY, mode) } catch { /* ignore */ }
  errorMessage.value = ''

  if (mode === 'jira') {
    loadHierarchy()
  } else if (excelRows.value.length > 0 && isMappingComplete.value) {
    applyExcelMapping()
  } else {
    dataSource.value = 'demo'
    hierarchyData.value = demoData
  }
})

onMounted(() => {
  const hasStoredExcel = restoreExcelState()

  let storedMode = null
  try { storedMode = localStorage.getItem(SOURCE_MODE_STORAGE_KEY) } catch { /* ignore */ }
  if (storedMode === 'jira' || storedMode === 'excel') sourceMode.value = storedMode

  if (sourceMode.value === 'jira') {
    loadHierarchy()
  } else if (hasStoredExcel && isMappingComplete.value) {
    applyExcelMapping()
  }
})

const getStatusClass = (status) => {
  switch (status) {
    case 'Done': return 'status-done text-emerald-700 border border-emerald-200'
    case 'On Track': return 'status-ontrack text-blue-700 border border-blue-200'
    case 'Needs Attention': return 'status-attention text-amber-700 border border-amber-200'
    default: return 'bg-gray-50 text-gray-600 border border-gray-200'
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
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen font-sans antialiased text-slate-800">

    <!-- Top Header -->
    <div class="mb-8 pb-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
      <div class="flex items-center gap-5">
        <img :src="allianderLogo" alt="Alliander" class="h-16 w-auto rounded-md shadow-sm" />
        <div class="h-11 w-px bg-gray-300"></div>
        <div>
          <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
            Ampère<span class="alliander-text">.</span>
          </h1>
          <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400 mt-1.5">
            <span>Agile Release Train</span>
            <span>•</span>
            <span class="alliander-text font-bold">Grote Werkpakketten</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full sm:w-auto self-stretch sm:self-auto justify-end flex-wrap">
        <button
          v-if="sourceMode === 'jira'"
          @click="loadHierarchy(true)"
          :disabled="isLoading"
          class="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-xs hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          <span :class="{ 'animate-spin': isLoading }">⟳</span>
          Vernieuwen
        </button>
        <button @click="expandAll" class="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-xs hover:bg-gray-50 transition-colors">
          Alles uitklappen
        </button>
        <button @click="collapseAll" class="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-xs hover:bg-gray-50 transition-colors">
          Alles inklappen
        </button>
        <div
          class="text-xs font-semibold border px-3 py-1 rounded-full ml-2 inline-flex items-center gap-1.5"
          :class="{
            'status-ontrack text-blue-700': dataSource === 'live',
            'status-inprogress alliander-text': dataSource === 'excel',
            'bg-gray-50 text-gray-500 border-gray-200': dataSource === 'demo',
          }"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="{ 'bg-blue-500': dataSource === 'live', 'alliander-bg': dataSource === 'excel', 'bg-gray-400': dataSource === 'demo' }"
          ></span>
          {{ dataSource === 'live' ? 'Live Jira-data' : dataSource === 'excel' ? 'Excel-data' : 'Demo-data' }}
        </div>
      </div>
    </div>

    <!-- Databron-schakelaar -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Databron</span>
      <div class="inline-flex rounded-md border border-gray-300 bg-white p-0.5 shadow-xs">
        <button
          @click="sourceMode = 'excel'"
          class="text-xs font-semibold px-3 py-1 rounded transition-colors"
          :class="sourceMode === 'excel' ? 'alliander-bg text-white' : 'text-gray-600 hover:bg-gray-50'"
        >
          Excel
        </button>
        <button
          @click="sourceMode = 'jira'"
          class="text-xs font-semibold px-3 py-1 rounded transition-colors"
          :class="sourceMode === 'jira' ? 'alliander-bg text-white' : 'text-gray-600 hover:bg-gray-50'"
        >
          Jira (live)
        </button>
      </div>
      <span class="text-xs text-gray-400">Jira-koppeling volgt zodra het API-token is vrijgegeven — tot die tijd vult Excel het dashboard.</span>
    </div>

    <!-- Excel-importpaneel -->
    <div v-if="sourceMode === 'excel'" class="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs text-slate-600">
          <span v-if="excelFileName">Bestand: <span class="font-semibold text-slate-800">{{ excelFileName }}</span> ({{ excelRows.length }} rijen)</span>
          <span v-else>Nog geen Excel-bestand gekozen.</span>
        </div>
        <label class="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-xs hover:bg-gray-50 transition-colors cursor-pointer">
          {{ excelFileName ? 'Ander bestand kiezen' : 'Bestand kiezen (.xlsx)' }}
          <input type="file" accept=".xlsx,.xls" class="hidden" @change="onExcelFileSelected" />
        </label>
      </div>

      <div v-if="excelError" class="mt-3 text-xs font-medium text-red-600">{{ excelError }}</div>

      <div v-if="excelHeaders.length > 0" class="mt-4 pt-4 border-t border-gray-100">
        <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Kolommen koppelen</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div v-for="field in MAPPING_FIELD_DEFS" :key="field.key">
            <label class="block text-[10px] font-semibold text-gray-500 mb-1">
              {{ field.label }}<span v-if="field.required" class="text-red-500"> *</span>
            </label>
            <select v-model="excelMapping[field.key]" class="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white">
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
          Dashboard vullen vanuit Excel
        </button>
      </div>
    </div>

    <!-- Foutmelding bij mislukte Jira-koppeling -->
    <div v-if="errorMessage" class="mb-6 -mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
      <span>Kon geen live Jira-data ophalen ({{ errorMessage }}) — demo-data getoond.</span>
      <button @click="loadHierarchy(true)" class="font-semibold underline whitespace-nowrap shrink-0">Opnieuw proberen</button>
    </div>

    <!-- Epic Container -->
    <div v-for="epic in hierarchyData" :key="epic.id" class="mb-8 border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white">

      <!-- Epic Header -->
      <div @click="toggleEpic(epic.id)" class="corporate-dark-bg p-5 text-white flex justify-between items-center cursor-pointer select-none hover:opacity-98 transition-opacity relative">
        <div class="flex items-center gap-3 z-10">
          <span class="text-sm font-bold text-emerald-400 transition-transform duration-200" :class="openEpics.includes(epic.id) ? 'transform rotate-90' : ''">▶</span>
          <span class="text-[10px] font-bold alliander-bg text-white px-2 py-0.5 rounded tracking-wider uppercase">Epic</span>
          <span class="font-bold text-lg tracking-tight text-white">{{ epic.title }}</span>
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
      <div v-show="openEpics.includes(epic.id)" class="p-5 bg-slate-50/30 space-y-6">
        <div v-for="objective in epic.objectives" :key="objective.id" class="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">

          <!-- Objective Title -->
          <div @click="toggleObjective(objective.id)" class="p-4 bg-white hover:bg-slate-50/50 flex items-start justify-between gap-3 cursor-pointer select-none border-b border-gray-100">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 text-xs font-bold text-gray-400 transition-transform duration-200" :class="openObjectives.includes(objective.id) ? 'transform rotate-90' : ''">▶</span>
              <span class="text-[10px] font-bold status-inprogress alliander-text border px-2 py-0.5 rounded tracking-wider uppercase whitespace-nowrap">Objective</span>
              <h3 class="text-sm font-bold text-slate-900 leading-relaxed">{{ objective.title }}</h3>
            </div>
            <div class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded whitespace-nowrap" @click.stop>
              <span>BV:</span>
              <span class="font-bold text-slate-700">{{ objective.businessValue }}</span>
            </div>
          </div>

          <!-- Features Table -->
          <div v-show="openObjectives.includes(objective.id)" class="p-4 bg-white overflow-x-auto">
            <div class="rounded-lg border border-gray-200">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-gray-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th class="p-3 w-1/2">Feature</th>
                    <th class="p-3">Team</th>
                    <th class="p-3">Status</th>
                    <th class="p-3 text-right">Voortgang (Stories)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="feature in objective.features" :key="feature.id" class="hover:bg-slate-50/60 transition-colors" :class="{ 'almost-done-row': isAlmostDone(feature) }">
                    <td class="p-3">
                      <div class="font-bold text-slate-900 text-sm">{{ feature.title }}</div>
                      <div class="text-slate-400 font-mono mt-0.5">{{ feature.jiraKey }}</div>
                    </td>
                    <td class="p-3 whitespace-nowrap">
                      <span class="alliander-bg text-white font-bold px-2.5 py-1 rounded-md text-xs" v-if="feature.team === 'Team ANO SW'">
                        {{ feature.team }}
                      </span>
                      <span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs" v-else>
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
                        <span class="font-mono text-slate-600 font-bold">{{ feature.completedStories }}/{{ feature.totalStories }}</span>
                        <div class="h-2 w-20 rounded-full bg-gray-100 overflow-hidden inline-block border border-gray-200 relative">
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
</template>

<style>
.alliander-bg { background-color: #00B064 !important; }
.alliander-text { color: #00B064 !important; }
.corporate-dark-bg { background-color: #001A3D !important; }

.status-done { background-color: rgba(16, 185, 129, 0.1) !important; }
.status-ontrack { background-color: rgba(59, 130, 246, 0.1) !important; }
.status-attention { background-color: rgba(245, 158, 11, 0.1) !important; }
.status-inprogress { background-color: rgba(0, 176, 100, 0.1) !important; }

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
</style>
