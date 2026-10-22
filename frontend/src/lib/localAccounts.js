/* =========================================================
   Accounts used while Firebase is NOT connected.
   - Built-in accounts (src/config/builtInAccounts.js) always exist.
   - Accounts created with "Create account" live in this browser.
   Passwords are never stored: only a salted PBKDF2-SHA-256 hash
   (150,000 rounds). Each account has a role (admin / placement /
   student) and a status (active / pending / disabled).
========================================================= */
import { BUILT_IN_ACCOUNTS } from '../config/builtInAccounts.js'

const ACCOUNTS_KEY = 'gjimt:lms:local-accounts'
export const ITERATIONS = 150000
const encoder = new TextEncoder()

export const toHex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((pair) => parseInt(pair, 16)))
const normaliseEmail = (email) => String(email || '').trim().toLowerCase()

const subtle = () => {
  const api = globalThis.crypto?.subtle
  if (!api) throw new Error('Open the LMS on localhost or an https:// address to sign in.')
  return api
}

export async function hashPassword(password, saltBytes, iterations = ITERATIONS) {
  const key = await subtle().importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, 256)
  return toHex(bits)
}

/** Constant-time comparison of two hex strings. */
const sameHash = (a = '', b = '') => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

const readAccounts = (storage) => {
  try { return JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]') } catch { return [] }
}
const writeAccounts = (storage, accounts) => storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))

// Accounts made before roles existed were open sign-ups: treat them as Placement Cell, waiting for approval.
const withDefaults = (account) => ({ ...account, role: account.role || 'placement', status: account.status || 'pending' })

/** What the rest of the app may see — never the salt or hash. */
const publicProfile = (account, builtIn = false) => ({
  uid: account.uid,
  name: account.name,
  email: account.email,
  role: account.role,
  status: account.status || 'active',
  createdAt: account.createdAt || null,
  emailVerified: Boolean(account.emailVerified),
  google: Boolean(account.google),
  photoURL: account.photoURL || '',
  builtIn,
})

export const isBuiltInEmail = (email) => BUILT_IN_ACCOUNTS.some((account) => account.email === normaliseEmail(email))

export const findLocalAccount = (email, storage = globalThis.localStorage) => {
  const found = readAccounts(storage).find((account) => account.email === normaliseEmail(email))
  return found ? withDefaults(found) : null
}

/** Every account: built-in ones first, then the ones created in this browser. */
export const listAccounts = (storage = globalThis.localStorage) => [
  ...BUILT_IN_ACCOUNTS.map((account) => publicProfile({ ...account, status: 'active' }, true)),
  ...readAccounts(storage).map((account) => publicProfile(withDefaults(account))),
]

/** Creates the account and returns the public profile (no hash). New Placement Cell accounts wait for approval. */
export async function createLocalAccount({ name, email, password, role = 'placement', status = 'pending', emailVerified = false, google = false, photoURL = '' }, storage = globalThis.localStorage) {
  const accounts = readAccounts(storage)
  const cleanEmail = normaliseEmail(email)
  if (isBuiltInEmail(cleanEmail)) throw new Error('This email is reserved. Please use a different email.')
  if (accounts.some((account) => account.email === cleanEmail)) {
    throw new Error('An account with this email already exists — sign in instead.')
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const account = {
    uid: `local-${toHex(globalThis.crypto.getRandomValues(new Uint8Array(8)))}`,
    name: String(name).trim().replace(/\s+/g, ' '),
    email: cleanEmail,
    role,
    status,
    salt: toHex(salt),
    hash: await hashPassword(password, salt),
    iterations: ITERATIONS,
    emailVerified: Boolean(emailVerified),
    google: Boolean(google),
    photoURL: String(photoURL || ''),
    createdAt: new Date().toISOString(),
  }
  writeAccounts(storage, [...accounts, account])
  return publicProfile(account)
}

/** A random password nobody knows — for accounts opened with Google (a password can be set later with "Forgot password"). */
export const unusablePassword = () => `g-${toHex(globalThis.crypto.getRandomValues(new Uint8Array(24)))}`

/** Remember that this account also signs in with Google (email verified by Google), and its photo. */
export function markGoogleAccount(email, { photoURL = '' } = {}, storage = globalThis.localStorage) {
  const cleanEmail = normaliseEmail(email)
  const accounts = readAccounts(storage)
  writeAccounts(storage, accounts.map((account) => (account.email === cleanEmail ? { ...account, google: true, emailVerified: true, photoURL: photoURL || account.photoURL || '' } : account)))
  const found = readAccounts(storage).find((account) => account.email === cleanEmail)
  return found ? publicProfile(withDefaults(found)) : null
}

/** New password for a browser account (after the emailed code was checked). Built-in accounts cannot be reset here. */
export async function setLocalPassword(email, password, storage = globalThis.localStorage) {
  const cleanEmail = normaliseEmail(email)
  if (isBuiltInEmail(cleanEmail)) throw new Error('Built-in account passwords are changed in frontend/src/config/builtInAccounts.js.')
  const accounts = readAccounts(storage)
  if (!accounts.some((account) => account.email === cleanEmail)) throw new Error('No account found for this email.')
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashPassword(password, salt)
  writeAccounts(storage, accounts.map((account) => (account.email === cleanEmail
    ? { ...account, salt: toHex(salt), hash, iterations: ITERATIONS, emailVerified: true, passwordChangedAt: new Date().toISOString() }
    : account)))
  return publicProfile(withDefaults(readAccounts(storage).find((account) => account.email === cleanEmail)))
}

/** Checks the password against built-in accounts, then browser accounts. Returns the public profile or throws. */
export async function verifyAccount(email, password, storage = globalThis.localStorage) {
  const cleanEmail = normaliseEmail(email)
  const builtIn = BUILT_IN_ACCOUNTS.find((account) => account.email === cleanEmail)
  const account = builtIn || findLocalAccount(cleanEmail, storage)
  if (!account) throw new Error('No account found for this email.')
  const hash = await hashPassword(password, fromHex(account.salt), account.iterations || ITERATIONS)
  if (!sameHash(hash, account.hash)) throw new Error('Email or password is incorrect.')
  return publicProfile(builtIn ? { ...account, status: 'active' } : account, Boolean(builtIn))
}

/** Older name kept for existing callers/tests. */
export const verifyLocalAccount = verifyAccount

/** Admin: change role/status of a browser account. Built-in accounts cannot be changed here. */
export function updateLocalAccount(uid, changes, storage = globalThis.localStorage) {
  const allowed = {}
  if (changes.role) allowed.role = changes.role
  if (changes.status) allowed.status = changes.status
  if (changes.name) allowed.name = String(changes.name).trim()
  const accounts = readAccounts(storage)
  if (!accounts.some((account) => account.uid === uid)) throw new Error('Built-in accounts cannot be changed here.')
  writeAccounts(storage, accounts.map((account) => (account.uid === uid ? { ...account, ...allowed } : account)))
  return listAccounts(storage).find((account) => account.uid === uid)
}

export function removeLocalAccount(uid, storage = globalThis.localStorage) {
  const accounts = readAccounts(storage)
  if (!accounts.some((account) => account.uid === uid)) throw new Error('Built-in accounts cannot be removed.')
  writeAccounts(storage, accounts.filter((account) => account.uid !== uid))
}
