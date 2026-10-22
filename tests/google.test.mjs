// "Continue with Google" — server checks of Google's ID token. Run with:  npm test
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGoogleAuth, downloadGoogleKeys, googleKeyStore, googleNetworkError, verifyGoogleToken } from '../backend/googleAuth.mjs'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }

const CLIENT = '123456789012-abcdef0123456789.apps.googleusercontent.com'
const google = generateKeyPairSync('rsa', { modulusLength: 2048 })
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...google.publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' }
let fetches = 0
const fetchKeys = async () => { fetches += 1; return { ok: true, json: async () => ({ keys: [jwk] }), headers: { get: () => 'public, max-age=3600' } } }
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const token = (claims = {}, { key = google.privateKey, kid = 'key-1' } = {}) => {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' })
  const body = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '10769150350006150715113082367', email: 'Aman.Gill@gmail.com', email_verified: true, name: 'Aman Gill', picture: 'https://lh3.googleusercontent.com/a/photo', iat: now - 10, exp: now + 3600, ...claims })
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`
}
const keyFor = googleKeyStore({ fetchKeys })
const check = (value) => verifyGoogleToken(value, { clientId: CLIENT, keyFor })

console.log('Google ID token checks')
await test('a real Google answer for our Client ID → the verified email (lower case), name and photo', async () => {
  assert.deepEqual(await check(token()), { email: 'aman.gill@gmail.com', name: 'Aman Gill', picture: 'https://lh3.googleusercontent.com/a/photo', sub: '10769150350006150715113082367' })
  await check(token()); assert.equal(fetches, 1, 'Google’s keys are cached')
})
await test('refused: signed by someone else, another app, expired, not from Google, email not verified, garbage', async () => {
  await assert.rejects(check(token({}, { key: stranger.privateKey })), /could not be confirmed/)
  await assert.rejects(check(token({ aud: '999-other.apps.googleusercontent.com' })), /different app/)
  await assert.rejects(check(token({ exp: now - 600 })), /expired/)
  await assert.rejects(check(token({ iss: 'https://evil.example.com' })), /did not come from Google/)
  await assert.rejects(check(token({ email_verified: false })), /not verified/)
  await assert.rejects(check(token({ email: '' })), /did not share an email/)
  await assert.rejects(check('not-a-token'), /valid answer/)
  await assert.rejects(check(token({}, { kid: 'unknown-key' })), /could not be checked/)
  const [head, body] = token().split('.'); const forged = b64({ ...JSON.parse(Buffer.from(body, 'base64url')), email: 'admin@gjimt.ac.in' })
  await assert.rejects(check(`${head}.${forged}.${token().split('.')[2]}`), /could not be confirmed/, 'changing the email breaks the signature')
  assert.equal((await check(token({ picture: 'http://insecure/photo' }))).picture, '', 'only https photos are kept')
})

console.log('Endpoints')
const fakeReq = (method, url, body) => {
  const listeners = {}
  const req = { method, url, headers: { 'content-type': 'application/json' }, on: (event, fn) => { listeners[event] = fn; return req }, destroy() {} }
  setTimeout(() => { if (body !== undefined) listeners.data?.(Buffer.from(JSON.stringify(body))); listeners.end?.() })
  return req
}
const call = (api, req) => new Promise((resolve) => {
  const res = { statusCode: 0, setHeader() {}, end: (text) => resolve({ status: res.statusCode, body: JSON.parse(text) }) }
  api.handle(req, res, () => resolve({ status: 'next' }))
})
await test('off until GOOGLE_CLIENT_ID is in env/backend.env (picked up without a restart); a wrong-looking ID stays off', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'google-'))
  const env = join(dir, '.env')
  const api = createGoogleAuth({ envFile: env, env: {}, fetchKeys })
  assert.deepEqual((await call(api, fakeReq('GET', '/api/auth/google/config'))).body, { enabled: false, clientId: '' })
  const off = await call(api, fakeReq('POST', '/api/auth/google/verify', { credential: token() }))
  assert.equal(off.status, 503); assert.equal(off.body.code, 'not-configured')
  writeFileSync(env, 'GOOGLE_CLIENT_ID=not-a-client-id\n')
  assert.equal((await call(api, fakeReq('GET', '/api/auth/google/config'))).body.enabled, false)
  await new Promise((r) => setTimeout(r, 20)); writeFileSync(env, `SMTP_USER=x@gmail.com\nGOOGLE_CLIENT_ID=${CLIENT}\n`)
  assert.deepEqual((await call(api, fakeReq('GET', '/api/auth/google/config'))).body, { enabled: true, clientId: CLIENT })
  const ok = await call(api, fakeReq('POST', '/api/auth/google/verify', { credential: token() }))
  assert.equal(ok.status, 200); assert.equal(ok.body.email, 'aman.gill@gmail.com'); assert.equal(ok.body.ok, true)
  const bad = await call(api, fakeReq('POST', '/api/auth/google/verify', { credential: token({ aud: 'x' }) }))
  assert.equal(bad.status, 401); assert.match(bad.body.error, /different app/)
  assert.equal((await call(api, fakeReq('GET', '/api/mail/status'))).status, 'next', 'other paths are passed on')
})

console.log('Reaching Google from the LMS computer')
const quiet = { warn() {} }
await test('network problems are explained in plain English (with the code)', () => {
  const undici = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' } })
  assert.match(googleNetworkError(undici).message, /could not reach Google.*\(UNABLE_TO_GET_ISSUER_CERT_LOCALLY\).*antivirus/)
  assert.equal(googleNetworkError(undici).status, 503)
  assert.match(googleNetworkError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }).message, /antivirus or firewall/)
  assert.match(googleNetworkError({ code: 'ENOTFOUND' }).message, /could not look up googleapis\.com/)
  assert.match(googleNetworkError({ code: 'ETIMEDOUT' }).message, /network may be blocking it.*hotspot/)
  assert.match(googleNetworkError(new Error('x')).message, /could not reach Google to check this sign-in\. Check the internet/)
})
await test('antivirus re-signing HTTPS: the download is retried trusting the computer’s own certificates', async () => {
  const calls = []
  const get = async (url, options = {}) => {
    calls.push(options.ca ? 'with-computer-certs' : 'plain')
    if (!options.ca?.includes('AV-ROOT')) throw Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' })
    return { ok: true, json: async () => ({ keys: [jwk] }), headers: { get: () => '' } }
  }
  const response = await downloadGoogleKeys({ get, extraCertificates: async () => ['AV-ROOT'] })
  assert.equal(response.ok, true); assert.deepEqual(calls, ['plain', 'with-computer-certs'])
  calls.length = 0
  await assert.rejects(downloadGoogleKeys({ get: async () => { calls.push('plain'); throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }, extraCertificates: async () => ['AV-ROOT'] }), /ENOTFOUND/)
  assert.deepEqual(calls, ['plain'], 'no retry for a missing internet connection')
})
await test('key download failing: clear 503; a key already downloaded keeps working', async () => {
  let online = false
  const store = googleKeyStore({ log: quiet, fetchKeys: async () => { if (!online) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); return { ok: true, json: async () => ({ keys: [jwk] }), headers: { get: () => 'max-age=0' } } } })
  await assert.rejects(store('key-1'), (error) => error.status === 503 && /\(ECONNRESET\)/.test(error.message))
  online = true; assert.ok(await store('key-1'))
  online = false; assert.ok(await store('key-1'), 'cached key still used when Google is briefly unreachable')
})
await test('GET /api/auth/google/check reports whether this computer can reach Google', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'google-'))
  writeFileSync(join(dir, '.env'), `GOOGLE_CLIENT_ID=${CLIENT}\n`)
  const ok = createGoogleAuth({ envFile: join(dir, '.env'), env: {}, fetchKeys, log: quiet })
  assert.deepEqual((await call(ok, fakeReq('GET', '/api/auth/google/check'))).body, { ok: true, keys: 1, clientId: true })
  const down = createGoogleAuth({ envFile: join(dir, '.env'), env: {}, log: quiet, fetchKeys: async () => { throw Object.assign(new Error('x'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }) } })
  const body = (await call(down, fakeReq('GET', '/api/auth/google/check'))).body
  assert.equal(body.ok, false); assert.match(body.error, /SELF_SIGNED_CERT_IN_CHAIN.*antivirus/)
  const verify = await call(down, fakeReq('POST', '/api/auth/google/verify', { credential: token() }))
  assert.equal(verify.status, 503); assert.match(verify.body.error, /could not reach Google/)
})
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
