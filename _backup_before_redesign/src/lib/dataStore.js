import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { seedData } from '../data/seedData'

const LOCAL_PREFIX = 'gjimt:lms:data:'

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
  return records
}

const mapFirestoreDoc = (snap) => ({ id: snap.id, ...snap.data() })

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
      return { id: snap.id, ...record }
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore add failed, using local data:`, error)
    }
  }
  const records = readLocal(name)
  const next = { id: makeId(), ...record }
  writeLocal(name, [next, ...records])
  return next
}

export async function updateRecord(name, id, payload) {
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, name, id), payload)
      return { id, ...payload }
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore update failed, using local data:`, error)
    }
  }
  const records = readLocal(name)
  const next = records.map((item) => (item.id === id ? { ...item, ...payload } : item))
  writeLocal(name, next)
  return next.find((item) => item.id === id)
}

export async function deleteRecord(name, id) {
  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, name, id))
      return
    } catch (error) {
      console.warn(`[GJIMT LMS] Firestore delete failed, using local data:`, error)
    }
  }
  const records = readLocal(name)
  writeLocal(name, records.filter((item) => item.id !== id))
}

export function resetLocalData() {
  Object.keys(seedData).forEach((name) => localStorage.removeItem(`${LOCAL_PREFIX}${name}`))
  return true
}

export function exportRows(name) {
  return readLocal(name)
}
