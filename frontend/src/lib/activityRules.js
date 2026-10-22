/* =========================================================
   Activity log — pure helpers (no storage), shared by the app and tests.
   - describeChange: turns a saved change into a plain sentence
     ("Edited student “Aman Gill” — Phone Number 1, Address")
   - sign-in sessions: online / signed out / left without signing out,
     time spent, device name
========================================================= */
import { entityConfigs, sideNav } from '../config/modules.js'

export const ACTIVITY = 'activity'
export const LOGIN_SESSIONS = 'loginSessions'
/** Never logged (the log itself, emails queue, secret codes). */
export const SKIP_COLLECTIONS = new Set([ACTIVITY, LOGIN_SESSIONS, 'outbox', 'attendanceCodes', 'public'])
/** Seen within this many minutes = "Online now". */
export const ONLINE_MINUTES = 3
/** No click / typing for this long = not counted as working. */
export const IDLE_MINUTES = 5
/** How many entries a browser keeps (oldest are dropped first). */
export const MAX_ACTIVITY = 5000
export const MAX_SESSIONS = 2000

export const AREAS = {
  students: 'Master Data', placements: 'Placement Drives', internships: 'Internships', visits: 'Industrial Visits', talks: 'Industry & Alumni',
  applications: 'Applications', attendance: 'Attendance', attendanceMarks: 'Attendance',
}
const THINGS = {
  students: 'student', placements: 'placement drive', internships: 'internship', visits: 'industrial visit', talks: 'talk',
  applications: 'application', attendance: 'attendance session', attendanceMarks: 'attendance mark',
}
const text = (value) => String(value ?? '').trim()
const titleOf = (name, record = {}) => {
  if (!record) return ''
  switch (name) {
    case 'students': return text(record.name) || text(record.rollNo)
    case 'placements': case 'internships': return [text(record.company), text(record.role)].filter(Boolean).join(' — ')
    case 'visits': return text(record.organization)
    case 'talks': return [text(record.speaker), text(record.topic)].filter(Boolean).join(' — ')
    case 'applications': return [text(record.name), text(record.company)].filter(Boolean).join(' → ')
    case 'attendance': return text(record.title)
    case 'attendanceMarks': return [text(record.name), text(record.sessionTitle)].filter(Boolean).join(' — ')
    default: return text(record.name || record.title || record.company)
  }
}

// Bookkeeping fields that don't count as an edit
const QUIET_KEYS = new Set(['updatedAt', 'createdAt', 'updatedBy', 'history', 'statusAt', 'placedAt', 'emailUpdatedAt', 'openedAt', 'closedAt'])
const EMAIL_KEYS = new Set(['emailLog', 'emailSummary', 'emailUpdatedAt', 'emailKind', 'emailRequestedAt', 'emailHistory'])

const humanise = (key) => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
export const fieldLabel = (name, key) => entityConfigs[name]?.fields?.find((field) => field.key === key)?.label || humanise(key)

/** Keys whose value really changed (compared with the record before, when known). */
export function changedKeys(changes = {}, before = null) {
  return Object.keys(changes || {}).filter((key) => !QUIET_KEYS.has(key) && (!before || text(Array.isArray(before[key]) ? before[key].join(', ') : before[key]) !== text(Array.isArray(changes[key]) ? changes[key].join(', ') : changes[key])))
}
const listFields = (name, keys, max = 5) => {
  const labels = keys.map((key) => fieldLabel(name, key))
  return labels.length > max ? `${labels.slice(0, max).join(', ')} +${labels.length - max} more` : labels.join(', ')
}

/**
 * A saved change → { action, detail, area, category } or null when it isn't worth logging.
 * event: from dataStore.onRecordChange; actor: { role } of the person who made it.
 */
export function describeChange(event = {}, actor = {}) {
  const { type, name } = event
  if (!name || SKIP_COLLECTIONS.has(name)) return null
  const area = AREAS[name] || humanise(name)
  const thing = THINGS[name] || 'record'
  const before = event.before || null
  const record = { ...(before || {}), ...(event.record || {}), ...(event.changes || {}) }
  const title = titleOf(name, record) || titleOf(name, before) || `#${String(event.id || '').slice(0, 8)}`
  const isStudent = actor?.role === 'student'
  const base = { area, category: 'change' }

  if (type === 'import') return { ...base, category: 'import', action: `Imported ${event.created + event.updated} record${event.created + event.updated === 1 ? '' : 's'} into ${area}`, detail: `${event.created} added, ${event.updated} updated` }

  if (type === 'delete') {
    if (name === 'attendanceMarks') return null // removed together with their session
    return { ...base, action: `Deleted ${thing} “${title}”` }
  }

  const changes = event.changes || event.record || {}
  const keys = changedKeys(changes, before)
  const isNew = type === 'add' || (type === 'set' && !before)

  if (name === 'placements' && !isNew && keys.length && keys.every((key) => EMAIL_KEYS.has(key))) return null // email progress, logged separately

  if (name === 'applications') {
    const status = changes.status
    if (status === 'Applied' && (isNew || before?.status === 'Withdrawn')) return { ...base, action: isStudent ? `Applied for ${record.company}${record.role ? ` — ${record.role}` : ''}` : `Added ${record.name}’s application for ${record.company}`, detail: before?.status === 'Withdrawn' ? 'Applied again after withdrawing' : '' }
    if (status === 'Withdrawn') return { ...base, action: `Withdrew the application for ${record.company}` }
    const parts = []
    if (keys.includes('status')) parts.push(`status → ${status}`)
    if (keys.includes('roundsCleared')) parts.push(`rounds cleared → ${changes.roundsCleared || 0}`)
    if (keys.includes('note')) parts.push(`message: “${text(changes.note).slice(0, 80)}”`)
    if (!parts.length) return null
    return { ...base, action: `Updated ${record.name}’s application (${record.company})`, detail: parts.join(' · ') }
  }

  if (name === 'attendance' && !isNew && keys.includes('checkIn')) {
    const state = changes.checkIn
    return { ...base, action: `${state === 'Open' ? 'Opened' : state === 'Closed' ? 'Closed' : 'Changed'} check-in: ${title}` }
  }

  if (name === 'attendanceMarks') {
    if (changes.method === 'Code') return { ...base, action: `Checked in with the code — ${record.sessionTitle || 'session'}` }
    if (!keys.includes('status') && !isNew) return null
    return { ...base, action: `Marked ${record.name} ${record.status} — ${record.sessionTitle || 'session'}` }
  }

  if (name === 'students' && isStudent) {
    if (isNew) return { ...base, action: 'Registered in Master Data (own sign-up)', detail: [record.rollNo, record.course, record.batch].filter(Boolean).join(' · ') }
    if (!keys.length) return null
    return { ...base, action: 'Updated own registration', detail: listFields(name, keys) }
  }

  if (isNew) return { ...base, action: `Added ${thing} “${title}”` }
  const shown = keys.filter((key) => !EMAIL_KEYS.has(key))
  if (!shown.length) return null
  return { ...base, action: `Edited ${thing} “${title}”`, detail: listFields(name, shown) }
}

/* ---------- Sign-in sessions ---------- */

const minutesBetween = (from, to) => Math.max(0, (new Date(to) - new Date(from)) / 60000)

/** { key: 'online' | 'ended' | 'left', label, at } */
export function sessionState(session = {}, now = new Date()) {
  if (session.endedAt) return { key: 'ended', label: session.endReason || 'Signed out', at: session.endedAt }
  if (session.lastSeenAt && minutesBetween(session.lastSeenAt, now) <= ONLINE_MINUTES) return { key: 'online', label: 'Online now', at: session.lastSeenAt }
  return { key: 'left', label: 'Left without signing out', at: session.lastSeenAt || session.startedAt }
}

/** Minutes from sign-in to sign-out (or to the last moment they were seen). */
export const sessionMinutes = (session = {}, now = new Date()) => {
  if (!session.startedAt) return 0
  const state = sessionState(session, now)
  return minutesBetween(session.startedAt, state.key === 'online' ? now : (session.endedAt || session.lastSeenAt || session.startedAt))
}

export function formatDuration(minutes) {
  const total = Math.round(Number(minutes) || 0)
  if (total < 1) return 'under 1 min'
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${hours} h`
}

/** "Chrome on Windows", "Safari on iPhone"… from the browser's user agent. */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent)
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const system = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet') : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'unknown device'
  return `${browser} on ${system}`
}

/* ---------- Filters ---------- */

const localDay = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA') }

/** period: 'today' | '7d' | '30d' | 'all' | 'YYYY-MM-DD' (one day). */
export function inPeriod(iso, period = 'all', now = new Date()) {
  if (!iso) return false
  if (period === 'all') return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return localDay(iso) === period
  if (period === 'today') return localDay(iso) === localDay(now)
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 0
  if (!days) return true
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1))
  return new Date(iso) >= start
}

/** Total minutes a person was in the LMS during a period (sessions overlapping it). */
export function minutesIn(sessions = [], period = 'today', now = new Date()) {
  return sessions.filter((session) => inPeriod(session.startedAt, period, now) || inPeriod(session.lastSeenAt, period, now)).reduce((sum, session) => sum + sessionMinutes(session, now), 0)
}

/* ---------- Page names ---------- */

const EXTRA_PAGES = [['/drives/new', 'New placement drive'], ['/settings', 'Settings'], ['/activity', 'Activity log'], ['/login', 'Login']]

/** "/drives/abc/edit" → "Placement drive (edit)" — the activity log's "last page". */
export function pageLabel(path = '/') {
  const extra = EXTRA_PAGES.find(([route]) => path === route)
  if (extra) return extra[1]
  if (/^\/drives\/[^/]+\/edit$/.test(path)) return 'Placement drive (edit)'
  if (/^\/drives\/[^/]+$/.test(path)) return 'Placement drive'
  if (/^\/attendance\/[^/]+$/.test(path)) return 'Attendance session'
  const match = sideNav.filter((item) => path === item.route || (item.route !== '/' && path.startsWith(`${item.route}/`))).sort((a, b) => b.route.length - a.route.length)[0]
  return match ? match.label : path
}
