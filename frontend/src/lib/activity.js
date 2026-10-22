/* =========================================================
   Activity log — who signed in, when they were working, and what
   they did. Only the Admin can read it (Activity log page).

   loginSessions  one record per sign-in: started, last active,
                  signed out, device, last page
   activity       one line per action: sign-in / sign-out, every
                  add / edit / delete / import (from dataStore),
                  emails sent, downloads, account approvals…
========================================================= */
import { addRecord, getRecord, listRecords, onRecordChange, setRecord, trimLocal, updateRecord } from './dataStore'
import { isFirebaseConfigured } from './firebase'
import { ACTIVITY, LOGIN_SESSIONS, MAX_ACTIVITY, MAX_SESSIONS, SKIP_COLLECTIONS, describeChange, deviceLabel } from './activityRules'
import { roleLabel } from './roles'

const SESSION_ID_KEY = 'gjimt:lms:activity-session'
const TOUCH_EVERY_MS = 45 * 1000

let actor = null // { uid, email, name, role }
let sessionId = ''
let currentPage = ''
let lastTouch = 0
let lastTouchedPage = ''

const nowISO = () => new Date().toISOString()
const makeId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const who = (user) => (user ? { uid: user.uid || '', email: String(user.email || '').toLowerCase(), name: user.displayName || user.name || '', role: user.role || '' } : null)

const storeSessionId = (id, remember) => {
  try {
    localStorage.removeItem(SESSION_ID_KEY); sessionStorage.removeItem(SESSION_ID_KEY)
    if (id) (remember ? localStorage : sessionStorage).setItem(SESSION_ID_KEY, id)
  } catch { /* storage blocked */ }
}
const readSessionId = () => { try { return localStorage.getItem(SESSION_ID_KEY) || sessionStorage.getItem(SESSION_ID_KEY) || '' } catch { return '' } }

/** Is this signed-in person already being tracked in this tab? */
export const isTracking = (user) => Boolean(user && actor && sessionId && actor.email === String(user.email || '').toLowerCase())
export const setCurrentPage = (label) => { currentPage = label || '' }

/** One line in the log. Never throws — logging must not get in the way of work. */
export async function logActivity(action, { detail = '', area = '', category = 'action', ref = '', person = actor } = {}) {
  if (!person?.email || !action) return null
  if (isFirebaseConfigured && !person.uid) return null // not signed in: Firebase won't accept it
  try {
    const entry = await addRecord(ACTIVITY, {
      at: nowISO(), uid: person.uid || '', email: person.email, name: person.name || '', role: person.role || '',
      sessionId: person === actor ? sessionId : '', category, action, detail: String(detail || '').slice(0, 500), area, ref, page: currentPage,
    })
    if (!isFirebaseConfigured) trimLocal(ACTIVITY, MAX_ACTIVITY)
    return entry
  } catch { return null }
}

// Every saved change (any page, any role) becomes a readable line in the log
onRecordChange(async (event) => {
  if (!actor || SKIP_COLLECTIONS.has(event.name)) return
  const described = describeChange(event, actor)
  if (described) await logActivity(described.action, described)
})

/** A new sign-in: opens a session record and logs "Signed in". */
export async function startSession(user, { remember = true, resumed = false, note = '' } = {}) {
  actor = who(user)
  sessionId = makeId()
  storeSessionId(sessionId, remember)
  const at = nowISO()
  lastTouch = Date.now()
  try {
    await setRecord(LOGIN_SESSIONS, sessionId, {
      uid: actor.uid, email: actor.email, name: actor.name, role: actor.role,
      startedAt: at, lastSeenAt: at, endedAt: '', endReason: '',
      device: deviceLabel(globalThis.navigator?.userAgent), lastPage: currentPage, resumed: resumed ? 'Yes' : 'No',
    }, { merge: false })
    if (!isFirebaseConfigured) trimLocal(LOGIN_SESSIONS, MAX_SESSIONS)
  } catch { /* logging must not block sign-in */ }
  await logActivity(resumed ? 'Opened the LMS (was still signed in)' : `Signed in as ${roleLabel(actor.role)}`, { category: 'sign-in', area: 'Login', detail: note })
}

/** Page reload / app opened while still signed in: carry on with the same session, or start one. */
export async function resumeSession(user) {
  const person = who(user)
  const stored = readSessionId()
  if (stored) {
    const record = await getRecord(LOGIN_SESSIONS, stored).catch(() => null)
    if (record && !record.endedAt && record.email === person.email) {
      actor = person
      sessionId = stored
      lastTouch = 0
      await touchSession({ force: true })
      return
    }
  }
  await startSession(user, { resumed: true, remember: true })
}

/** "Last active" — called on page changes and every minute while the person is actually using the LMS. */
export async function touchSession({ force = false } = {}) {
  if (!actor || !sessionId) return
  const now = Date.now()
  if (!force && now - lastTouch < TOUCH_EVERY_MS && currentPage === lastTouchedPage) return
  lastTouch = now
  lastTouchedPage = currentPage
  try { await updateRecord(LOGIN_SESSIONS, sessionId, { lastSeenAt: nowISO(), lastPage: currentPage }) } catch { /* ignore */ }
}

/** Sign-out: logs it and closes the session record. */
export async function endSession(reason = 'Signed out') {
  if (!actor) return
  await logActivity(reason, { category: 'sign-in', area: 'Login' })
  if (sessionId) {
    const at = nowISO()
    try { await updateRecord(LOGIN_SESSIONS, sessionId, { endedAt: at, endReason: reason, lastSeenAt: at }) } catch { /* ignore */ }
  }
  storeSessionId('', false)
  actor = null
  sessionId = ''
}

/** Wrong password, wrong portal, pending or switched-off account (only recorded without Firebase). */
export const logFailedSignIn = (email, portal, reason) => logActivity('Sign-in refused', {
  person: { uid: '', email: String(email || '').trim().toLowerCase(), name: '', role: portal || '' },
  category: 'sign-in', area: 'Login', detail: reason,
})

/** For someone not signed in yet (account requests, password reset). */
export const logFor = (person, action, options = {}) => logActivity(action, { ...options, person: who(person) })

export const listActivity = () => listRecords(ACTIVITY)
export const listLoginSessions = () => listRecords(LOGIN_SESSIONS)
