/* Placement drives are stored in the existing "placements" collection, so the
   Admin's Placements table, Excel import/export, Dashboard and login stats all see them. */
import * as XLSX from 'xlsx'
import { entityConfigs } from '../config/modules'
import { listRecords, updateRecord } from './dataStore'
import { emailCounts } from './driveEmail'
import { orderedFields, safeSheetName } from './importer'

export const DRIVES = 'placements'

export const todayISO = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local time
export const isUpcoming = (drive, today = todayISO()) => String(drive?.driveDate || '') >= today

export async function listDrives() {
  return listRecords(DRIVES)
}

export async function getDrive(id) {
  return (await listRecords(DRIVES)).find((drive) => drive.id === id) || null
}

/** Upcoming drives first (soonest first), then past drives (latest first). */
export function sortDrives(drives, today = todayISO()) {
  const upcoming = drives.filter((drive) => isUpcoming(drive, today)).sort((a, b) => String(a.driveDate).localeCompare(String(b.driveDate)))
  const past = drives.filter((drive) => !isUpcoming(drive, today)).sort((a, b) => String(b.driveDate).localeCompare(String(a.driveDate)))
  return [...upcoming, ...past]
}

/** "20 sent · 3 waiting · 1 failed" — also stored on the drive for tables and exports. */
export function emailSummaryText(log = []) {
  const counts = emailCounts(log)
  if (!counts.total) return ''
  return [counts.sent && `${counts.sent} sent`, counts.queued && `${counts.queued} waiting`, counts.failed && `${counts.failed} failed`].filter(Boolean).join(' · ')
}

export function saveEmailLog(id, log) {
  return updateRecord(DRIVES, id, { emailLog: log, emailSummary: emailSummaryText(log), emailUpdatedAt: new Date().toISOString() })
}

/** Excel file of the drives shown, with every detail and the email result. */
export function exportDrives(drives) {
  const fields = orderedFields(entityConfigs.placements)
  const rows = drives.map((drive) => ({
    ...Object.fromEntries(fields.map((field) => [field.label, drive[field.key] ?? ''])),
    Emails: drive.emailSummary || '',
  }))
  const headers = [...fields.map((field) => field.label), 'Emails']
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  sheet['!cols'] = headers.map((header) => ({ wch: Math.min(48, Math.max(12, header.length + 2, ...rows.map((row) => String(row[header] ?? '').length + 2))) }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, safeSheetName('Placement drives'))
  XLSX.writeFile(book, `placement-drives-${todayISO()}.xlsx`)
}

/** Who-gets-the-email options stored on a drive — now kept with the email rules (driveEmail.js). */
export { recipientOptions } from './driveEmail'
