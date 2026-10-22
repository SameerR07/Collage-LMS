/* =========================================================
   Email outbox for every non-drive email (welcome, registration,
   applications, attendance…). Each email is saved first as a
   "queued" record in the outbox collection, then sent through the
   mail API. If email isn't set up yet (or the service isn't
   running), it simply waits — the Placement Cell can send the
   waiting emails later from the Emails page.
========================================================= */
import { addRecord, listRecords, updateRecord } from './dataStore'
import { NOTIFY_KINDS, cleanNotifyData } from './notifyEmail'
import { SETUP_ERROR, getMailStatus } from './mailClient'

export const OUTBOX = 'outbox'
export const STAFF_ADDRESS = 'placement-cell' // stands for PLACEMENT_CELL_EMAIL on the server
const BATCH = 10

const headers = () => {
  const token = import.meta.env?.VITE_MAIL_API_TOKEN
  return { 'Content-Type': 'application/json', ...(token ? { 'X-Mail-Token': token } : {}) }
}

/**
 * Saves one queued email per recipient and tries to send them straight away (without waiting).
 * kind: a NOTIFY_KINDS key; to: [{ name, email }] (ignored for Placement Cell alerts).
 */
export async function queueEmails(kind, data, to = [], { ref = '', by = '', send = true } = {}) {
  const spec = NOTIFY_KINDS[kind]
  if (!spec || spec.serverOnly) throw new Error(`Unknown email kind "${kind}"`)
  const people = spec.toStaff ? [{ name: 'Placement Cell', email: STAFF_ADDRESS }] : to.filter((person) => person?.email)
  const clean = cleanNotifyData(kind, data)
  const created = []
  for (const person of people) {
    created.push(await addRecord(OUTBOX, {
      kind, label: spec.label, data: clean, ref,
      to: { name: String(person.name || '').trim(), email: String(person.email).trim().toLowerCase() },
      status: 'queued', error: '', attempts: 0, by: String(by || ''),
    }))
  }
  if (send && created.length) deliverOutbox({ items: created }).catch(() => {})
  return created
}

const groupKey = (item) => `${item.kind}|${JSON.stringify(item.data || {})}`

/** Still to be sent: queued, or "failed" by an older version only because the email settings were wrong (not the person). */
export const isWaiting = (item) => item.status === 'queued' || (item.status === 'failed' && SETUP_ERROR.test(item.error || ''))

/** Re-read entries handed over directly (another send may have finished them meanwhile). */
async function freshCopies(items) {
  const stored = await listRecords(OUTBOX).catch(() => [])
  const byId = new Map(stored.map((item) => [item.id, item]))
  return items.map((item) => byId.get(item.id) || item)
}

/**
 * Sends queued emails (and failed ones too when retryFailed). ids limits it to those entries.
 * Returns { sent, failed, waiting, stopped } — stopped: '' | 'offline' | 'not-configured' | 'login' | 'unreachable' | 'error'.
 */
let running = Promise.resolve()
export function deliverOutbox(options = {}) {
  // One delivery at a time in this tab, so an automatic send and a button press never email anyone twice
  const run = running.then(() => sendQueued(options))
  running = run.catch(() => {})
  return run
}

async function sendQueued({ retryFailed = false, ids = null, items = null, onProgress = () => {} } = {}) {
  const all = items ? await freshCopies(items) : await listRecords(OUTBOX)
  const wanted = ids ? new Set(ids) : null
  const pending = all.filter((item) => (!wanted || wanted.has(item.id)) && (isWaiting(item) || (retryFailed && item.status === 'failed')))
  const summary = { sent: 0, failed: 0, waiting: pending.length, stopped: '' }
  if (!pending.length) return summary
  const status = await getMailStatus()
  if (!status.reachable) return { ...summary, stopped: 'offline' }
  if (!status.configured) return { ...summary, stopped: 'not-configured' }

  // Same kind + same details → one request for up to 10 people
  const groups = new Map()
  pending.forEach((item) => { const key = groupKey(item); groups.set(key, [...(groups.get(key) || []), item]) })
  for (const items of groups.values()) {
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH)
      let results
      try {
        const response = await fetch('/api/mail/notify', { method: 'POST', headers: headers(), body: JSON.stringify({ kind: batch[0].kind, data: batch[0].data, recipients: batch.map((item) => item.to) }) })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) return { ...summary, stopped: body.code === 'not-configured' ? 'not-configured' : 'error', message: body.error || `Mail server error ${response.status}` }
        results = body.results || []
      } catch {
        return { ...summary, stopped: 'offline' }
      }
      const byEmail = new Map(results.map((result) => [result.email, result]))
      const now = new Date().toISOString()
      for (const item of batch) {
        const result = byEmail.get(item.to.email)
        const ok = Boolean(result?.ok)
        if (!ok && result?.setup) { // the email login / connection failed — keep it waiting, it isn't this person's fault
          await updateRecord(OUTBOX, item.id, { status: 'queued', error: result.error || '', at: now, attempts: (item.attempts || 0) + 1 })
          continue
        }
        await updateRecord(OUTBOX, item.id, { status: ok ? 'sent' : 'failed', error: ok ? '' : result?.error || 'Not sent', at: now, attempts: (item.attempts || 0) + 1 })
        summary[ok ? 'sent' : 'failed'] += 1
        summary.waiting -= 1
      }
      onProgress({ ...summary })
      const setup = results.find((result) => result.setup)?.setup
      if (setup) return { ...summary, stopped: setup === 'connection' ? 'unreachable' : 'login', message: results.find((result) => result.setup).error }
      if (results.length && results.every((result) => !result.ok)) return { ...summary, stopped: 'error', message: results[0].error }
    }
  }
  return summary
}

/** 'sent' | 'failed' | 'queued' as shown to people (setup failures count as waiting). */
export const outboxStatus = (item) => (isWaiting(item) ? 'queued' : item.status || 'queued')

export function outboxCounts(items = []) {
  return items.reduce((counts, item) => {
    counts.total += 1
    const status = outboxStatus(item)
    if (status === 'sent') counts.sent += 1
    else if (status === 'failed') counts.failed += 1
    else counts.queued += 1
    return counts
  }, { total: 0, sent: 0, failed: 0, queued: 0 })
}

let autoSent = false
/** Staff pages: once per visit, quietly send anything left waiting (e.g. emails queued while email wasn't set up). */
export function sendWaitingOnce() {
  if (autoSent) return
  autoSent = true
  listRecords(OUTBOX)
    .then((items) => (items.some(isWaiting) ? deliverOutbox() : null))
    .catch(() => {})
}
