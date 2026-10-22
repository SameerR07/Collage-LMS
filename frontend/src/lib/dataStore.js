import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { seedData } from '../data/seedData'
import { computeLoginStats } from './statsCore'

const LOCAL_PREFIX = 'gjimt:lms:data:'
export const LOCAL_DATA_PREFIX = LOCAL_PREFIX
/** Fired on window whenever records saved in this browser change (detail.name = collection). */
export const DATA_CHANGED_EVENT = 'gjimt:data-changed'
/** Firestore doc holding only the three login-page numbers — readable before sign-in (see firestore.rules). */
export const PUBLIC_STATS_PATH = ['public', 'loginStats']
const STATS_CACHE_KEY = 'gjimt:lms:login-stats'
const STATS_SOURCES = ['students', 'placements', 'internships']

const announceChange = (name) => {
  try { window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { name } })) } catch { /* not running in a browser */ }
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const readLocal = (name) => {
  const key = `${LOCAL_PREFIX}${name}`
  const raw = localStorage.getItem(key)
  if (raw) return JSON.parse(raw)

  const initial = (seedData[name] || []).map((item) => ({ ...item, id: makeId(), createdAt: new Date().toISOString() }))
  localStorage.setItem(key, JSON.stringify(initial))
  return initial
}

const writeLocal = (name, records) => {
  localStorage.setItem(`${LOCAL_PREFIX}${name}`, JSON.stringify(records))
  announceChange(name)
  return records
}

const mapFirestoreDoc = (snap) => ({ id: snap.id, ...snap.data() })

/* ---------- Change listeners (used by the Admin's activity log) ----------
   After every successful write: { type: 'add' | 'update' | 'set' | 'delete' | 'import', name, id, record, changes, before }.
   "before" is the record as it was (always known without Firebase; for Firebase deletes it is read first). */
const changeListeners = new Set()
export function onRecordChange(listener) {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}
const emitChange = (event) => changeListeners.forEach((listener) => { try { listener(event) } catch { /* a listener must never break saving */ } })
const findLocal = (name, id) => { try { return readLocal(name).find((item) => item.id === id) || null } catch { return null } }
/** Firebase: the record as it is now — only read when someone is listening (the activity log). */
const readBeforeCloud = (name, id) => (changeListeners.size ? getDoc(doc(db, name, id)).then((snap) => (snap.exists() ? mapFirestoreDoc(snap) : null)).catch(() => null) : Promise.resolve(null))

/** Keep only the newest `max` records of a browser collection (newest first). */
export function trimLocal(name, max) {
  try {
    const records = readLocal(name)
    if (records.length > max) writeLocal(name, records.slice(0, max))
  } catch { /* storage unavailable */ }
}

const seedFirestoreCollection = async (name) => {
  const batch = seedData[name] || []
  const ref = collection(db, name)
  const created = []
  for (const item of batch) {
    const snap = await addDoc(ref, { ...item, createdAt: new Date().toISOString() })
    created.push({ id: snap.id, ...item })
  }
  return created
}

export async function listRecords(name) {
  if (isFirebaseConfigured) {
    try {
      const snapshot = await getDocs(collection(db, name))
      if (!snapshot.empty) return snapshot.docs.map(mapFirestoreDoc)
      if ((seedData[name] || []).length) return seedFirestoreCollection(name)
      return []
    } catch (error) {
      console.warn(`[GJIMT LMS] Falling back to local ${name} data:`, error)
      return readLocal(name)
    }
  }
  return readLocal(name)
}

export async function addRecord(name, payload) {
  const record = { ...payload, createdAt: new Date().toISOString() }
  if (isFirebaseConfigured) {
    try {
      const snap = await addDoc(collection(db, name), record)
      afterCloudWrite(name)
      emitChange({ type: 'add', name, id: snap.id, record: { id: snap.id, ...record } })
      return { id: snap.id, ...record }
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore add failed, using local data:`, error)
    }
  }
  const records = readLocal(name)
  const next = { id: makeId(), ...record }
  writeLocal(name, [next, ...records])
  emitChange({ type: 'add', name, id: next.id, record: next })
  return next
}

export async function updateRecord(name, id, payload) {
  if (isFirebaseConfigured) {
    try {
      const before = await readBeforeCloud(name, id)
      await updateDoc(doc(db, name, id), payload)
      afterCloudWrite(name)
      emitChange({ type: 'update', name, id, changes: payload, before })
      return { id, ...payload }
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore update failed, using local data:`, error)
    }
  }
  const records = readLocal(name)
  const before = records.find((item) => item.id === id) || null
  const next = records.map((item) => (item.id === id ? { ...item, ...payload } : item))
  writeLocal(name, next)
  emitChange({ type: 'update', name, id, changes: payload, before })
  return next.find((item) => item.id === id)
}

/** One record by id (null when missing). */
export async function getRecord(name, id) {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDoc(doc(db, name, id))
      return snap.exists() ? mapFirestoreDoc(snap) : null
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore read failed, using local data:`, error)
    }
  }
  return readLocal(name).find((item) => item.id === id) || null
}

/**
 * Records whose field equals value. With Firebase this is a server-side query, so a student
 * only ever downloads their own rows (see firestore.rules). Locally it filters this browser's rows.
 */
export async function queryRecords(name, field, value) {
  if (isFirebaseConfigured) {
    try {
      const snapshot = await getDocs(query(collection(db, name), where(field, '==', value)))
      return snapshot.docs.map(mapFirestoreDoc)
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore query failed, using local data:`, error)
    }
  }
  return readLocal(name).filter((item) => item[field] === value)
}

/** Create or replace a record with a chosen id (used where one record per person/session is needed). */
export async function setRecord(name, id, payload, { merge = true, strict = false } = {}) {
  const now = new Date().toISOString()
  if (isFirebaseConfigured) {
    try {
      const before = await readBeforeCloud(name, id)
      await setDoc(doc(db, name, id), { ...payload, updatedAt: now }, { merge })
      afterCloudWrite(name)
      emitChange({ type: 'set', name, id, record: { id, ...payload, updatedAt: now }, changes: payload, before })
      return { id, ...payload, updatedAt: now }
    } catch (error) {
      // strict: the cloud said no (e.g. a wrong attendance code) — report it instead of saving only in this browser
      if (strict) throw new Error(error?.code === 'permission-denied' ? 'Not accepted — please check and try again.' : 'Could not save. Check the internet connection and try again.')
      console.warn(`[GJIMT LMS] Firestore save failed, using local data:`, error)
    }
  }
  const records = readLocal(name)
  const existing = records.find((item) => item.id === id)
  const next = existing
    ? { ...(merge ? existing : { id, createdAt: existing.createdAt }), ...payload, id, updatedAt: now }
    : { id, ...payload, createdAt: now, updatedAt: now }
  writeLocal(name, existing ? records.map((item) => (item.id === id ? next : item)) : [next, ...records])
  emitChange({ type: 'set', name, id, record: next, changes: payload, before: existing || null })
  return next
}

export async function deleteRecord(name, id) {
  if (isFirebaseConfigured) {
    try {
      const before = await readBeforeCloud(name, id) // so the activity log can say what was deleted
      await deleteDoc(doc(db, name, id))
      afterCloudWrite(name)
      emitChange({ type: 'delete', name, id, before })
      return
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore delete failed, using local data:`, error)
    }
  }
  const before = findLocal(name, id)
  const records = readLocal(name)
  writeLocal(name, records.filter((item) => item.id !== id))
  emitChange({ type: 'delete', name, id, before })
}

/**
 * Bulk save used by spreadsheet import.
 * creates: [payload], updates: [{ id, changes }]
 * Firestore: batched writes (400 per batch, under the 500 limit). If Firestore refuses,
 * the remaining rows fall back to local storage — the same behaviour as single adds.
 */
export async function importRecords(name, { creates = [], updates = [] }, onProgress = () => {}) {
  const now = new Date().toISOString()
  const ops = [
    ...creates.map((payload) => ({ type: 'create', data: { ...payload, createdAt: now } })),
    ...updates.map(({ id, changes }) => ({ type: 'update', id, data: changes })),
  ]
  const total = ops.length
  let done = 0

  if (isFirebaseConfigured && total) {
    try {
      for (let start = 0; start < ops.length; start += 400) {
        const chunk = ops.slice(start, start + 400)
        const batch = writeBatch(db)
        chunk.forEach((op) => {
          if (op.type === 'create') batch.set(doc(collection(db, name)), op.data)
          else batch.update(doc(db, name, op.id), op.data)
        })
        await batch.commit()
        done += chunk.length
        onProgress(done, total)
      }
      afterCloudWrite(name)
      emitChange({ type: 'import', name, created: creates.length, updated: updates.length })
      return { created: creates.length, updated: updates.length, storage: 'cloud' }
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore import failed after ${done} rows, saving the rest locally:`, error)
    }
  }

  const remaining = ops.slice(done)
  const updateMap = new Map(remaining.filter((op) => op.type === 'update').map((op) => [op.id, op.data]))
  const records = readLocal(name).map((item) => (updateMap.has(item.id) ? { ...item, ...updateMap.get(item.id) } : item))
  const added = remaining.filter((op) => op.type === 'create').map((op) => ({ id: makeId(), ...op.data }))
  writeLocal(name, [...added, ...records])
  onProgress(total, total)
  emitChange({ type: 'import', name, created: creates.length, updated: updates.length })
  return { created: creates.length, updated: updates.length, storage: done ? 'mixed' : 'local' }
}

export function resetLocalData() {
  Object.keys(seedData).forEach((name) => localStorage.removeItem(`${LOCAL_PREFIX}${name}`))
  announceChange('*')
  return true
}

export function exportRows(name) {
  return readLocal(name)
}

/* ---------- Login-page Quick Stats ---------- */

/** Records as the app will show them, without creating sample rows — safe before sign-in. */
export function peekLocal(name) {
  try {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${name}`)
    if (raw) return JSON.parse(raw)
  } catch { /* unreadable → same samples the app would start with */ }
  return seedData[name] || []
}

export const localLoginStats = () => computeLoginStats(Object.fromEntries(STATS_SOURCES.map((name) => [name, peekLocal(name)])))

export function readCachedStats() {
  try { return JSON.parse(localStorage.getItem(STATS_CACHE_KEY) || 'null') } catch { return null }
}
export function cacheStats(stats) {
  try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats)) } catch { /* storage full or blocked */ }
}

/** Firebase mode: recount from the cloud records and publish the three numbers (no personal data) for the login page. */
export async function refreshPublicStats() {
  if (!isFirebaseConfigured) return localLoginStats()
  const lists = await Promise.all(STATS_SOURCES.map(async (name) => {
    const snapshot = await getDocs(collection(db, name))
    return [name, snapshot.docs.map((item) => item.data())]
  }))
  const stats = computeLoginStats(Object.fromEntries(lists))
  cacheStats(stats)
  await setDoc(doc(db, ...PUBLIC_STATS_PATH), stats)
  return stats
}

let refreshTimer = null
/** Debounced refresh so a burst of edits or a big import publishes once. */
export function schedulePublicStatsRefresh(delay = 1500) {
  if (!isFirebaseConfigured) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshPublicStats().catch((error) => console.warn('[GJIMT LMS] Login-page stats were not refreshed:', error))
  }, delay)
}

function afterCloudWrite(name) {
  if (STATS_SOURCES.includes(name)) schedulePublicStatsRefresh()
}
