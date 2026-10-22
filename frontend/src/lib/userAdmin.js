/* =========================================================
   Admin → Users: list accounts, approve, switch off, change role.
   Local mode: accounts in this browser (+ built-in ones).
   Firebase: the users/{uid} profile documents.
========================================================= */
import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { listAccounts, removeLocalAccount, updateLocalAccount } from './localAccounts'

export const USERS_CHANGED_EVENT = 'gjimt:users-changed'
const ACCOUNTS_KEY = 'gjimt:lms:local-accounts'
const announce = () => { try { window.dispatchEvent(new Event(USERS_CHANGED_EVENT)) } catch { /* not in a browser */ } }

export async function listUsers() {
  if (!isFirebaseConfigured) return listAccounts()
  const snapshot = await getDocs(collection(db, 'users'))
  return snapshot.docs.map((item) => ({ uid: item.id, builtIn: false, ...item.data() }))
}

export async function updateUser(uid, changes) {
  const allowed = {}
  if (changes.role) allowed.role = changes.role
  if (changes.status) allowed.status = changes.status
  if (!isFirebaseConfigured) updateLocalAccount(uid, allowed)
  else await updateDoc(doc(db, 'users', uid), allowed)
  announce()
}

export async function removeUser(uid) {
  if (!isFirebaseConfigured) removeLocalAccount(uid)
  else await deleteDoc(doc(db, 'users', uid)) // the sign-in itself stays in Firebase Auth but has no access
  announce()
}

/** Number of accounts waiting for approval (for the menu badge). Admin only. */
export function usePendingUsers(enabled) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    const refresh = () => listUsers()
      .then((users) => { if (alive) setCount(users.filter((user) => user.status === 'pending').length) })
      .catch(() => {})
    refresh()
    const onStorage = (event) => { if (!event.key || event.key === ACCOUNTS_KEY) refresh() }
    window.addEventListener(USERS_CHANGED_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => { alive = false; window.removeEventListener(USERS_CHANGED_EVENT, refresh); window.removeEventListener('storage', onStorage) }
  }, [enabled])
  return enabled ? count : 0
}
