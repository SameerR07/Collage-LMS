/* =========================================================
   Spreadsheet import engine
   Reads .xlsx / .xls / .csv files, matches columns to a module's
   fields, cleans every value and decides — row by row — whether
   it will be added, update an existing record, be skipped as a
   duplicate, or needs fixing first.
   Pure functions (no React) so the rules are easy to test.
========================================================= */
import * as XLSX from 'xlsx'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_ROWS = 5000
export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

// Columns we create ourselves and silently ignore on the way back in.
const SYSTEM_COLUMNS = new Set(['id', 'createdat', 'updatedat'])

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Roll No." → "rollno", "Start date *" → "startdate" */
export const normKey = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const isBlank = (value) => value === null || value === undefined || String(value).trim() === ''

const pad = (n) => String(n).padStart(2, '0')

/* ---------------------------------------------------------
   1. Reading the file
--------------------------------------------------------- */
export async function readWorkbook(file) {
  if (!file) throw new Error('Choose a file to import.')
  const name = file.name || ''
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new Error(`"${name}" is not a supported file. Use an Excel (.xlsx, .xls) or CSV (.csv) file.`)
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep imports under 5 MB (split large sheets into parts).`)
  }
  if (file.size === 0) throw new Error('This file is empty.')

  let workbook
  try {
    if (extension === '.csv') {
      // Read CSV as text so values like 08/10/2026 or 0091… stay exactly as typed.
      const text = (await file.text()).replace(/^﻿/, '')
      workbook = XLSX.read(text, { type: 'string', raw: true })
    } else {
      workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    }
  } catch {
    throw new Error('This file could not be read. Open it in Excel, save it as .xlsx or .csv, and try again.')
  }
  const sheetNames = workbook.SheetNames.filter((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    return sheet && sheet['!ref']
  })
  if (!sheetNames.length) throw new Error('No data was found in this file.')
  return { workbook, sheetNames, date1904: Boolean(workbook.Workbook?.WBProps?.date1904) }
}

/** Prefer a sheet named after the module (e.g. "Students" inside the full report). */
export function pickSheet(sheetNames, config) {
  const wanted = [config.collection, config.title, config.singular, `${config.singular}s`].map(normKey)
  return sheetNames.find((sheetName) => wanted.includes(normKey(sheetName))) || sheetNames[0]
}

/* ---------------------------------------------------------
   2. Columns
--------------------------------------------------------- */
const exactNames = (field) => [field.key, field.label, field.label.replace(/\(.*?\)/g, '')].map(normKey).filter(Boolean)
const aliasNames = (field) => (field.aliases || []).map(normKey).filter(Boolean)

/** Finds the header row (it may sit below a title row) and turns the rest into data rows. */
export function sheetToTable(sheet, config) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false })
  if (!grid.length) return { headers: [], rows: [], headerRowNumber: 0 }

  const known = new Set(config.fields.flatMap((field) => [...exactNames(field), ...aliasNames(field)]))
  let headerIndex = grid.findIndex((row) => row.some((cell) => !isBlank(cell)))
  let bestScore = -1
  grid.slice(0, 15).forEach((row, index) => {
    const score = row.filter((cell) => known.has(normKey(cell))).length
    if (score > bestScore) { bestScore = score; if (score > 0) headerIndex = index }
  })

  const headers = (grid[headerIndex] || []).map((cell) => String(cell ?? '').trim())
  const rows = grid
    .slice(headerIndex + 1)
    .map((values, offset) => ({ rowNumber: headerIndex + offset + 2, values }))
    .filter((row) => row.values.some((cell) => !isBlank(cell)))
  return { headers, rows, headerRowNumber: headerIndex + 1 }
}

/** Matches file columns to fields: exact names first, then aliases. */
export function mapColumns(headers, config) {
  const mapping = {}
  const used = new Set()
  const tryPass = (namesFor) => {
    headers.forEach((header, index) => {
      if (used.has(index)) return
      const key = normKey(header)
      if (!key) return
      const field = config.fields.find((candidate) => mapping[candidate.key] === undefined && namesFor(candidate).includes(key))
      if (field) { mapping[field.key] = index; used.add(index) }
    })
  }
  tryPass(exactNames)
  tryPass(aliasNames)
  const ignored = headers.filter((header, index) => !used.has(index) && header && !SYSTEM_COLUMNS.has(normKey(header)))
  const missing = config.fields.filter((field) => mapping[field.key] === undefined)
  return { mapping, ignored, missing }
}

/* ---------------------------------------------------------
   3. Cleaning values
--------------------------------------------------------- */
const validDate = (y, m, d) => {
  if (!(y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const monthIndex = (word) => {
  const index = MONTHS.indexOf(String(word).slice(0, 3).toLowerCase())
  return index >= 0 ? index + 1 : null
}

/** Accepts Excel dates, 2026-10-08, 08/10/2026 (day first, Indian style), 8 Oct 2026, Oct 8, 2026. Returns YYYY-MM-DD. */
export function cleanDate(value, { date1904 = false } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value === 'number') {
    // Excel stores dates as day counts (1900 system: day 0 = 30 Dec 1899; Mac 1904 system: day 0 = 1 Jan 1904).
    if (value < 1 || value > 2958465) return null
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
    const date = new Date(base + Math.floor(value) * 86400000)
    return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }
  const text = String(value).trim().replace(/\s+/g, ' ')
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (match) return validDate(+match[1], +match[2], +match[3])
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (match) {
    let [a, b, y] = [+match[1], +match[2], +match[3]]
    if (y < 100) y += 2000
    if (b > 12 && a <= 12) [a, b] = [b, a] // clearly month-first (e.g. 10/25/2026)
    return validDate(y, b, a)
  }
  match = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,})\.?,?[\s-]+(\d{4})$/)
  if (match && monthIndex(match[2])) return validDate(+match[3], monthIndex(match[2]), +match[1])
  match = text.match(/^([A-Za-z]{3,})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})$/)
  if (match && monthIndex(match[1])) return validDate(+match[3], monthIndex(match[1]), +match[2])
  if (/^\d{5}$/.test(text)) return cleanDate(Number(text), { date1904 }) // an Excel serial that arrived as text
  return null
}

export function cleanOption(value, options) {
  const key = normKey(value)
  return options.find((option) => normKey(option) === key) || null
}

export function cleanNumber(value, field) {
  let number
  if (typeof value === 'number') number = value
  else {
    const text = String(value).replace(/[₹,\s]/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { error: `${field.label} must be a number (got "${value}")` }
    number = Number(text)
  }
  if (!Number.isFinite(number)) return { error: `${field.label} must be a number` }
  if (field.integer && !Number.isInteger(number)) return { error: `${field.label} must be a whole number (got ${number})` }
  if (field.min !== undefined && number < field.min) return { error: `${field.label} cannot be less than ${field.min}` }
  if (field.max !== undefined && number > field.max) return { error: `${field.label} cannot be more than ${field.max} (got ${number})` }
  return { value: String(number) }
}

/** Marks: 78, "78%", 78.5, or Excel percentages stored as fractions (0.78) → "78" / "78.5". */
export function cleanPercent(value, field) {
  const text = typeof value === 'number' ? '' : String(value).trim()
  const hadPercentSign = text.endsWith('%')
  let number = typeof value === 'number' ? value : Number(text.replace(/[%\s]/g, ''))
  if (!Number.isFinite(number) || (typeof value !== 'number' && !/^\d+(\.\d+)?%?$/.test(text.replace(/\s/g, '')))) {
    return { error: `${field.label} must be a percentage (got "${value}")` }
  }
  if (!hadPercentSign && number > 0 && number <= 1) number *= 100 // 0.78 → 78 (Excel % cells)
  if (number < 0 || number > 100) return { error: `${field.label} must be between 0 and 100 (got ${value})` }
  return { value: String(Math.round(number * 10) / 10) }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Common slips in email domains — imported as typed, but flagged so they can be corrected.
const EMAIL_DOMAIN_TYPOS = { 'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'outlok.com': 'outlook.com' }
export const emailWarning = (email) => {
  const domain = String(email).split('@')[1]
  return domain && EMAIL_DOMAIN_TYPOS[domain] ? `Check email domain “${domain}” — did you mean ${EMAIL_DOMAIN_TYPOS[domain]}?` : ''
}

export function cleanValue(field, raw, options = {}) {
  if (field.type === 'date') {
    const value = cleanDate(raw, options)
    return value ? { value } : { error: `${field.label} "${raw}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)` }
  }
  if (field.type === 'select') {
    const value = cleanOption(raw, field.options)
    return value ? { value } : { error: `${field.label} "${raw}" is not allowed — use ${field.options.join(', ')}` }
  }
  if (field.type === 'number') return cleanNumber(raw, field)
  if (field.type === 'percent') return cleanPercent(raw, field)
  const text = typeof raw === 'number' ? String(raw) : String(raw).trim().replace(/\s+/g, ' ')
  if (field.type === 'email') {
    const value = text.toLowerCase()
    return EMAIL.test(value) ? { value, warning: emailWarning(value) } : { error: `Email "${text}" does not look valid` }
  }
  if (field.format === 'phone') {
    const digits = text.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 15) return { error: `Phone "${text}" should have 10–15 digits` }
    // Drop the India country code (+91 / 0) so numbers are stored the same way as the form does.
    if (digits.length === 12 && digits.startsWith('91')) return { value: digits.slice(2) }
    if (digits.length === 11 && digits.startsWith('0')) return { value: digits.slice(1) }
    return { value: digits }
  }
  return { value: text }
}

/* ---------------------------------------------------------
   4. Row-by-row decision
--------------------------------------------------------- */
export const recordKey = (record, config) => {
  const parts = (config.uniqueBy || []).map((key) => normKey(record?.[key]))
  return parts.length && parts.every(Boolean) ? parts.join('|') : null
}

/** Required list fields (status, course…) still blank after automatic rules — the user picks a value for them. */
export function fieldsNeedingDefaults(table, mapping, config, options = {}) {
  const { blankRequired } = analyseRows({ table, mapping, config, ...options, defaults: {} })
  return config.fields.filter((field) => field.type === 'select' && field.required && blankRequired[field.key] > 0)
}

/**
 * @returns {{ items: Array, counts: {add, update, skip, error}, blockers: string[] }}
 * item.status: 'add' | 'update' | 'skip' | 'error'
 */
export function analyseRows({ table, mapping, config, existingRows = [], defaults = {}, mode = 'skip', date1904 = false }) {
  const blockers = config.fields
    .filter((field) => field.required && field.type !== 'select' && mapping[field.key] === undefined)
    .map((field) => `The file has no "${field.label}" column.`)

  const existing = new Map()
  existingRows.forEach((row) => { const key = recordKey(row, config); if (key && !existing.has(key)) existing.set(key, row) })
  const seen = new Map()
  const counts = { add: 0, update: 0, skip: 0, error: 0 }

  const blankRequired = {}
  const items = table.rows.slice(0, MAX_ROWS).map((row) => {
    const data = {}
    const provided = new Set()
    const errors = []
    const warnings = []
    const blanks = []
    // Pass 1 — clean every value that is present
    config.fields.forEach((field) => {
      const column = mapping[field.key]
      const raw = column === undefined ? '' : row.values[column]
      if (isBlank(raw)) { blanks.push(field); data[field.key] = ''; return }
      const result = cleanValue(field, raw, { date1904 })
      if (result.error) errors.push(result.error)
      else { data[field.key] = result.value; provided.add(field.key); if (result.warning) warnings.push(result.warning) }
    })
    // Pass 2 — fill blanks: a rule from other columns first (e.g. not interested → Opted Out), then the chosen default
    blanks.forEach((field) => {
      const derived = field.deriveWhenBlank?.(data)
      if (derived) { data[field.key] = derived; provided.add(field.key); return }
      if (field.type === 'select' && defaults[field.key]) { data[field.key] = defaults[field.key]; provided.add(field.key); return }
      if (field.required) { errors.push(`${field.label} is missing`); blankRequired[field.key] = (blankRequired[field.key] || 0) + 1 }
    })

    let status = 'add'
    let note = ''
    let matchId = null
    if (errors.length || blockers.length) status = 'error'
    else {
      const key = recordKey(data, config)
      if (key && seen.has(key)) { status = 'skip'; note = `Repeats row ${seen.get(key)} of this file` }
      else if (key && existing.has(key)) {
        if (mode === 'update') { status = 'update'; matchId = existing.get(key).id; note = 'Will update the existing record' }
        else { status = 'skip'; note = 'Already in the LMS' }
      }
      if (key && !seen.has(key)) seen.set(key, row.rowNumber)
    }
    counts[status] += 1
    // On update, only send columns that actually had values — blanks never wipe existing data —
    // and never rewrite the matching keys themselves (e.g. keep "BCA23026" even if the file says "bca23026").
    const identity = new Set(config.uniqueBy || [])
    const changes = Object.fromEntries(Object.entries(data).filter(([key]) => provided.has(key) && !identity.has(key)))
    return { rowNumber: row.rowNumber, values: row.values, data, changes, status, errors, warnings, note, matchId }
  })

  return { items, counts, blockers, blankRequired, truncated: table.rows.length > MAX_ROWS }
}

/* ---------------------------------------------------------
   5. Helper workbooks (template + problem rows)
--------------------------------------------------------- */
/** Fields in sheet/table order (Master Data: the registration sheet's order), then any others — used for export & template. */
export function orderedFields(config) {
  const keys = config.sheetOrder || (config.columns || []).map((column) => column.key)
  const byColumns = keys.map((key) => config.fields.find((field) => field.key === key)).filter(Boolean)
  return [...byColumns, ...config.fields.filter((field) => !byColumns.includes(field))]
}

/** Excel sheet names cannot contain : \\ / ? * [ ] and must be ≤ 31 characters. */
export const safeSheetName = (name) => String(name || 'Sheet1').replace(/[\\/?*[\]:]/g, '-').slice(0, 31)

const fieldHint = (field) => {
  if (field.type === 'select') return `One of: ${field.options.join(', ')}`
  if (field.type === 'date') return 'Date — YYYY-MM-DD or DD/MM/YYYY'
  if (field.type === 'number') return `Number${field.integer ? ' (whole)' : ''}${field.max !== undefined ? ` from ${field.min ?? 0} to ${field.max}` : ''}`
  if (field.type === 'percent') return 'Percentage 0–100 (78, 78% or Excel % cells all work)'
  if (field.type === 'email') return 'Email address'
  if (field.format === 'phone') return '10-digit mobile number'
  return 'Text'
}

export function buildTemplateWorkbook(config, example = {}) {
  const fields = orderedFields(config)
  const headers = fields.map((field) => field.label)
  const sample = fields.map((field) => example[field.key] ?? '')
  const sheet = XLSX.utils.aoa_to_sheet([headers, sample])
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, header.length + 4) }))
  const guide = XLSX.utils.aoa_to_sheet([
    ['Column', 'Required?', 'What to enter'],
    ...fields.map((field) => [field.label, field.required ? 'Yes' : 'No', fieldHint(field)]),
    [],
    ['Tips'],
    ['• Keep the first row as column names. Column order does not matter.'],
    ['• Replace the sample row with your data. Empty rows are ignored.'],
    [`• Rows are matched to existing records by: ${(config.uniqueBy || []).map((key) => config.fields.find((field) => field.key === key)?.label || key).join(' + ')}.`],
  ])
  guide['!cols'] = [{ wch: 26 }, { wch: 11 }, { wch: 60 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(config.title))
  XLSX.utils.book_append_sheet(workbook, guide, 'How to fill')
  return workbook
}

export function buildProblemsWorkbook(items, headers) {
  const rows = items.filter((item) => item.status === 'error')
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Row in your file', 'What to fix', ...headers],
    ...rows.map((item) => [item.rowNumber, item.errors.join('; '), ...headers.map((_, index) => item.values[index] ?? '')]),
  ])
  sheet['!cols'] = [{ wch: 10 }, { wch: 60 }, ...headers.map(() => ({ wch: 18 }))]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Rows to fix')
  return workbook
}
