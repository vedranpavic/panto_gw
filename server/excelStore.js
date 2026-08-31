import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'excel-data.json')

export const readPublishedExcelData = () => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const writePublishedExcelData = (teams) => {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const payload = { teams, publishedAt: Date.now() }
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8')
  return payload
}
