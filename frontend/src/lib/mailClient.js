/* =========================================================
   Talks to the mail API (/api/mail — see backend/mailApi.mjs).
   Emails are sent in small batches; the drive's email log is
   updated after each batch so nothing is lost if the page closes.
========================================================= */
import { DRIVE_EMAIL_FIELDS, emailCounts } from './driveEmail'

const BATCH = 10
const headers = () => {
  const token = import.meta.env?.VITE_MAIL_API_TOKEN
  return { 'Content-Type': 'application/json', ...(token ? { 'X-Mail-Token': token } : {}) }
}

/** { reachable, configured, from } — reachable is false when no mail API is running (e.g. static hosting). */
export async function getMailStatus() {
  try {
    const response = await fetch('/api/mail/status', { headers: headers() })
    if (!response.ok) return { reachable: response.status !== 404, configured: false, from: '' }
    const data = await response.json()
    return { reachable: true, configured: Boolean(data.configured), from: data.from || '' }
  } catch {
    return { reachable: false, configured: false, from: '' }
  }
}

// Errors that mean the email settings (env/backend.env) are the problem, not the student.
// Older versions marked such emails "failed"; they are treated as still waiting.
export const SETUP_ERROR = /^(The email or password was not accepted|Gmail needs an App Password|Could not reach the mail server)/
const setupFailed = (entry) => entry.status === 'failed' && SETUP_ERROR.test(entry.error || '')
const setupStop = (results) => {
  const hit = results.find((result) => result.setup)
  return hit ? { stopped: hit.setup === 'connection' ? 'unreachable' : 'login', message: hit.error } : null
}

const driveForEmail = (drive) => Object.fromEntries(DRIVE_EMAIL_FIELDS.map((key) => [key, drive[key] ?? '']))

/**
 * Sends every 'queued' (and, if retryFailed, every 'failed') entry in drive.emailLog.
 * save(log) is called after each batch to store progress; onProgress(counts) updates the UI.
 * Returns { log, stopped } — stopped explains why sending paused (not set up, offline…).
 */
export async function deliverDriveEmails(drive, { retryFailed = false, save = async () => {}, onProgress = () => {} } = {}) {
  let log = (drive.emailLog || []).map((entry) => ((retryFailed && entry.status === 'failed') || setupFailed(entry) ? { ...entry, status: 'queued', error: '' } : entry))
  const pending = () => log.filter((entry) => entry.status === 'queued')
  onProgress(emailCounts(log))

  const status = await getMailStatus()
  if (!status.reachable) return { log, stopped: 'offline' }
  if (!status.configured) return { log, stopped: 'not-configured' }

  while (pending().length) {
    const batch = pending().slice(0, BATCH)
    let results
    try {
      const response = await fetch('/api/mail/drive', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ drive: driveForEmail(drive), recipients: batch.map(({ name, email, course }) => ({ name, email, course })), update: drive.emailKind === 'update' }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return { log, stopped: data.code === 'not-configured' ? 'not-configured' : 'error', message: data.error || `Mail server error ${response.status}` }
      results = data.results || []
    } catch {
      return { log, stopped: 'offline' }
    }
    const byEmail = new Map(results.map((result) => [result.email, result]))
    const now = new Date().toISOString()
    log = log.map((entry) => {
      if (!batch.includes(entry)) return entry
      const result = byEmail.get(entry.email)
      if (result?.ok) return { ...entry, status: 'sent', error: '', at: now }
      if (result?.setup) return { ...entry, status: 'queued', error: result.error || '', at: now } // email login problem — keep waiting
      return { ...entry, status: 'failed', error: result?.error || 'Not sent', at: now }
    })
    await save(log)
    onProgress(emailCounts(log))
    const setup = setupStop(results)
    if (setup) return { log, ...setup }
    // A whole batch failing (e.g. wrong password) — stop instead of repeating the same error for every student.
    if (results.length && results.every((result) => !result.ok)) return { log, stopped: 'error', message: results[0].error }
  }
  return { log, stopped: '' }
}

export const STOP_MESSAGE = {
  offline: 'The email service isn’t running here, so the emails are waiting in the queue. Open the LMS with “npm run dev” on the computer that has the email settings, then press “Send waiting emails”.',
  'not-configured': 'Email isn’t set up yet — the emails are saved in the queue. Add the sending email and its password to env/backend.env, then press “Send waiting emails”.',
  error: 'The mail server reported a problem. The remaining emails are still in the queue.',
  login: 'The email login was refused, so nothing was sent — the emails are still waiting. The App Password in env/backend.env needs replacing: run “npm run mail-check” on that computer for the steps, then send the waiting emails again.',
  unreachable: 'The mail server could not be reached (internet, or a blocked email port), so the emails are still waiting. Run “npm run mail-check” to test it.',
}
