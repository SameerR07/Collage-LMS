// Sign-up rules and local (browser) accounts — run with:  npm test
import assert from 'node:assert/strict'
import { friendlyAuthError, passwordProblem, passwordStrength, signUpProblems } from '../frontend/src/lib/authHelpers.js'
import { createLocalAccount, findLocalAccount, listAccounts, markGoogleAccount, removeLocalAccount, setLocalPassword, unusablePassword, updateLocalAccount, verifyAccount, verifyLocalAccount } from '../frontend/src/lib/localAccounts.js'
import { canAccess, homeFor, signInProblem } from '../frontend/src/lib/roles.js'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }
const memoryStorage = () => { const data = new Map(); return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), dump: () => Object.fromEntries(data) } }

console.log('Sign-up rules')
await test('password rules', () => {
  assert.equal(passwordProblem('short1'), 'Use at least 8 characters.')
  assert.equal(passwordProblem('12345678'), 'Add at least one letter.')
  assert.equal(passwordProblem('abcdefgh'), 'Add at least one number.')
  assert.equal(passwordProblem('placement1'), '')
})
await test('strength meter', () => {
  assert.equal(passwordStrength('').label, '')
  assert.equal(passwordStrength('abc').label, 'Weak')
  assert.equal(passwordStrength('placement1').label, 'Weak')
  assert.equal(passwordStrength('Placement2026').label, 'Good')
  assert.equal(passwordStrength('Placement@2026!').label, 'Strong')
})
await test('form problems', () => {
  assert.deepEqual(signUpProblems({ name: 'A', email: 'x', password: 'abc', confirm: '' }), { name: 'Enter your full name.', email: 'Enter a valid email address.', password: 'Use at least 8 characters.' })
  assert.deepEqual(signUpProblems({ name: 'Simran Kaur', email: 's@gmail.com', password: 'placement1', confirm: 'placement2' }), { confirm: 'Passwords do not match.' })
  assert.deepEqual(signUpProblems({ name: 'Simran Kaur', email: 's@gmail.com', password: 'placement1', confirm: 'placement1' }), {})
})
await test('friendly Firebase errors', () => {
  assert.match(friendlyAuthError({ code: 'auth/email-already-in-use' }), /already exists/)
  assert.match(friendlyAuthError({ code: 'auth/invalid-credential' }), /incorrect/)
  assert.equal(friendlyAuthError({ message: 'Firebase: Something odd (auth/odd-thing).' }), 'Something odd')
})

console.log('Local accounts (no Firebase)')
await test('create → sign in → wrong password → duplicate', async () => {
  const storage = memoryStorage()
  const created = await createLocalAccount({ name: '  Simran   Kaur ', email: ' Simran@Example.com ', password: 'Placement2026' }, storage)
  assert.equal(created.name, 'Simran Kaur'); assert.equal(created.email, 'simran@example.com'); assert.match(created.uid, /^local-/)
  const raw = JSON.stringify(storage.dump())
  assert.ok(!raw.includes('Placement2026'), 'password is never stored'); assert.ok(findLocalAccount('SIMRAN@example.com', storage).hash.length === 64)
  const signedIn = await verifyLocalAccount('simran@example.com', 'Placement2026', storage)
  assert.equal(signedIn.uid, created.uid)
  await assert.rejects(verifyLocalAccount('simran@example.com', 'wrong-pass1', storage), /incorrect/)
  await assert.rejects(verifyLocalAccount('nobody@example.com', 'Placement2026', storage), /No account found/)
  assert.equal(created.role, 'placement'); assert.equal(created.status, 'pending')
  await assert.rejects(createLocalAccount({ name: 'Other', email: 'simran@example.com', password: 'Another123' }, storage), /already exists/)
})
await test('same password, different accounts → different hashes (salted)', async () => {
  const storage = memoryStorage()
  await createLocalAccount({ name: 'A One', email: 'a@x.in', password: 'SamePass123' }, storage)
  await createLocalAccount({ name: 'B Two', email: 'b@x.in', password: 'SamePass123' }, storage)
  assert.notEqual(findLocalAccount('a@x.in', storage).hash, findLocalAccount('b@x.in', storage).hash)
})

console.log('Roles & built-in accounts')
await test('new sign-ups are Placement Cell, waiting for approval; built-in emails are reserved', async () => {
  const storage = memoryStorage()
  const created = await createLocalAccount({ name: 'New Coordinator', email: 'coord@gmail.com', password: 'Coord2026x' }, storage)
  assert.equal(created.role, 'placement'); assert.equal(created.status, 'pending'); assert.equal(created.builtIn, false)
  await assert.rejects(createLocalAccount({ name: 'Fake Admin', email: 'ADMIN@gjimt.ac.in', password: 'Whatever123' }, storage), /reserved/)
})
await test('built-in Admin and Placement Cell accounts exist, cannot be changed or removed', async () => {
  const storage = memoryStorage()
  const all = listAccounts(storage)
  assert.deepEqual(all.filter((a) => a.builtIn).map((a) => [a.email, a.role, a.status]), [['admin@gjimt.ac.in', 'admin', 'active'], ['placementcell@gjimt.ac.in', 'placement', 'active']])
  assert.ok(!JSON.stringify(all).includes('hash'), 'no hashes leave the account store')
  await assert.rejects(verifyAccount('admin@gjimt.ac.in', 'not-the-password1', storage), /incorrect/)
  assert.throws(() => updateLocalAccount('builtin-admin', { status: 'disabled' }, storage), /Built-in/)
  assert.throws(() => removeLocalAccount('builtin-admin', storage), /Built-in/)
})
await test('Admin approves, switches off and removes browser accounts', async () => {
  const storage = memoryStorage()
  const created = await createLocalAccount({ name: 'Coord', email: 'c@x.in', password: 'Coord2026x' }, storage)
  assert.equal(updateLocalAccount(created.uid, { status: 'active', hash: 'evil' }, storage).status, 'active')
  assert.ok(!findLocalAccount('c@x.in', storage).hash.startsWith('evil'), 'only role/status/name can change')
  assert.equal((await verifyAccount('c@x.in', 'Coord2026x', storage)).status, 'active')
  updateLocalAccount(created.uid, { status: 'disabled' }, storage)
  assert.equal(listAccounts(storage).find((a) => a.uid === created.uid).status, 'disabled')
  removeLocalAccount(created.uid, storage)
  assert.equal(findLocalAccount('c@x.in', storage), null)
})
await test('accounts from before roles → Placement Cell waiting for approval', () => {
  const storage = memoryStorage()
  storage.setItem('gjimt:lms:local-accounts', JSON.stringify([{ uid: 'local-old', name: 'Old', email: 'old@x.in', salt: '00', hash: '00' }]))
  const old = listAccounts(storage).find((a) => a.uid === 'local-old')
  assert.equal(old.role, 'placement'); assert.equal(old.status, 'pending')
})
await test('who can open what', () => {
  assert.ok(canAccess('admin', '/students')); assert.ok(canAccess('admin', '/users')); assert.ok(canAccess('admin', '/drives/new'))
  assert.ok(canAccess('placement', '/drives')); assert.ok(canAccess('placement', '/drives/abc/edit')); assert.ok(canAccess('placement', '/settings'))
  assert.ok(!canAccess('placement', '/students')); assert.ok(!canAccess('placement', '/')); assert.ok(!canAccess('placement', '/drivesX')); assert.ok(!canAccess('placement', '/users'))
  assert.ok(!canAccess('student', '/drives')); assert.ok(!canAccess(undefined, '/'))
  assert.equal(homeFor('admin'), '/'); assert.equal(homeFor('placement'), '/drives')
})
await test('sign-in through the wrong portal, pending or switched off → clear message', () => {
  assert.match(signInProblem({ role: 'admin', status: 'active' }, 'placement'), /Admin account — choose “Login as Admin”/)
  assert.match(signInProblem({ role: 'placement', status: 'active' }, 'admin'), /Placement Cell account/)
  assert.match(signInProblem({ role: 'placement', status: 'pending' }, 'placement'), /waiting for the Admin/)
  assert.match(signInProblem({ role: 'placement', status: 'disabled' }, 'placement'), /switched off/)
  assert.equal(signInProblem({ role: 'placement', status: 'active' }, 'placement'), '')
})
console.log('Student accounts')
await test('student portal: own pages + settings only; staff get attendance and emails; Admin can’t open a student’s portal', () => {
  assert.ok(canAccess('student', '/student')); assert.ok(canAccess('student', '/student/drives')); assert.ok(canAccess('student', '/settings'))
  assert.ok(!canAccess('student', '/students')); assert.ok(!canAccess('student', '/drives')); assert.ok(!canAccess('student', '/attendance')); assert.ok(!canAccess('student', '/'))
  assert.ok(!canAccess('admin', '/student')); assert.ok(!canAccess('placement', '/student/registration')); assert.ok(canAccess('admin', '/students'))
  assert.ok(canAccess('placement', '/attendance/abc')); assert.ok(canAccess('placement', '/emails')); assert.ok(canAccess('admin', '/attendance'))
  assert.equal(homeFor('student'), '/student')
  assert.match(signInProblem({ role: 'student', status: 'active' }, 'placement'), /Student account — choose “Login as Student”/)
})
await test('student account: active at once, email-verified flag kept, password reset after code', async () => {
  const storage = memoryStorage()
  const created = await createLocalAccount({ name: 'Neha Rani', email: 'Neha@Gmail.com', password: 'Student2026', role: 'student', status: 'active', emailVerified: true }, storage)
  assert.equal(created.role, 'student'); assert.equal(created.status, 'active'); assert.equal(created.emailVerified, true)
  assert.equal((await verifyAccount('neha@gmail.com', 'Student2026', storage)).role, 'student')
  await setLocalPassword('NEHA@gmail.com', 'NewPass2026', storage)
  await assert.rejects(verifyAccount('neha@gmail.com', 'Student2026', storage), /incorrect/)
  assert.equal((await verifyAccount('neha@gmail.com', 'NewPass2026', storage)).email, 'neha@gmail.com')
  await assert.rejects(setLocalPassword('admin@gjimt.ac.in', 'Whatever123', storage), /Built-in/)
  await assert.rejects(setLocalPassword('nobody@x.in', 'Whatever123', storage), /No account/)
})
await test('Google accounts: opened without a known password, photo kept; an email account can also be marked as Google', async () => {
  const storage = memoryStorage()
  const google = await createLocalAccount({ name: 'Riya', email: 'riya@gmail.com', password: unusablePassword(), role: 'student', status: 'active', emailVerified: true, google: true, photoURL: 'https://lh3.googleusercontent.com/a/x' }, storage)
  assert.equal(google.google, true); assert.equal(google.photoURL, 'https://lh3.googleusercontent.com/a/x')
  assert.match(unusablePassword(), /^g-[0-9a-f]{48}$/); assert.notEqual(unusablePassword(), unusablePassword())
  await assert.rejects(verifyAccount('riya@gmail.com', 'anything123', storage), /incorrect/)
  await createLocalAccount({ name: 'Neha', email: 'neha@gmail.com', password: 'Neha2026x', role: 'student', status: 'active' }, storage)
  const marked = markGoogleAccount('NEHA@gmail.com', { photoURL: 'https://lh3.googleusercontent.com/a/n' }, storage)
  assert.equal(marked.google, true); assert.equal(marked.emailVerified, true)
  assert.equal((await verifyAccount('neha@gmail.com', 'Neha2026x', storage)).email, 'neha@gmail.com', 'password still works')
})
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
