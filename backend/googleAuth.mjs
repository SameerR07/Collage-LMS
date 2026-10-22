/* =========================================================
   "Continue with Google" for the student portal (without Firebase).

   The browser shows Google's own sign-in button (Google Identity
   Services). Google hands back a signed ID token; this server checks
   it before the LMS trusts the email inside:
     - signed by Google (keys from googleapis.com, cached)
     - made for OUR client ID (GOOGLE_CLIENT_ID in env/backend.env)
     - not expired, issued by accounts.google.com, email verified

   Endpoints
     GET  /api/auth/google/config   { enabled, clientId }
     POST /api/auth/google/verify   { credential } → { ok, email, name, picture }
     GET  /api/auth/google/check    { ok, keys } or { ok: false, error } — can this computer reach Google?
   No client secret is needed — never put one in this project.
   Test from the terminal:  npm run google-check
========================================================= */
import { execFile } from 'node:child_process'
import { createPublicKey, verify as verifySignature } from 'node:crypto'
import https from 'node:https'
import tls from 'node:tls'
import { envReader } from './env.mjs'

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']
const CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i
const MAX_BODY = 16 * 1024
const SKEW_SECONDS = 120

const fail = (message, status = 401) => Object.assign(new Error(message), { status })
const decode = (part) => JSON.parse(Buffer.from(String(part), 'base64url').toString('utf8'))

const CERT_ERROR = /CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)|ERR_TLS/i
const NETWORK_ERROR = /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR|ECONNABORTED/i

/** Plain-English reason the LMS server could not reach Google (shown on the login page and in the terminal). */
export function googleNetworkError(error) {
  const code = String(error?.code || error?.cause?.code || '')
  let hint = 'Check the internet connection on the computer running the LMS.'
  if (CERT_ERROR.test(code)) hint = 'An antivirus or firewall on this computer is checking secure (HTTPS) connections, and Node.js does not trust it. In the antivirus, allow Node.js or turn off HTTPS / web scanning, then try again.'
  else if (/ENOTFOUND|EAI_AGAIN/.test(code)) hint = 'The computer running the LMS could not look up googleapis.com — check its internet connection.'
  else if (NETWORK_ERROR.test(code)) hint = 'This network may be blocking it (some college networks need a proxy). Try another network, for example a phone hotspot.'
  return Object.assign(new Error(`The LMS could not reach Google to check this sign-in${code ? ` (${code})` : ''}. ${hint}`), { status: 503, code: code || 'google-unreachable' })
}

/** GET a JSON address with Node's https (answer shaped like fetch's). `ca` adds trusted certificates. */
export function getJson(url, { ca, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { accept: 'application/json' }, ...(ca ? { ca } : {}) }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ ok: response.statusCode === 200, status: response.statusCode, json: async () => JSON.parse(text), headers: { get: (name) => response.headers[String(name).toLowerCase()] } })
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })))
    request.on('error', reject)
  })
}

/* Antivirus programs (and some networks) re-sign HTTPS with their own certificate. Chrome trusts it because it is in the
   computer's certificate store; Node.js only trusts its built-in list. So, on a certificate error, the computer's own
   trusted certificates are added and the download is tried once more. */
let systemCertificates = null
function windowsRootCertificates() {
  const script = 'Get-ChildItem Cert:\\LocalMachine\\Root, Cert:\\CurrentUser\\Root | ForEach-Object { [Convert]::ToBase64String($_.RawData) }'
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve([])
      resolve(String(stdout).split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Za-z0-9+/=]{100,}$/.test(line))
        .map((base64) => `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`))
    })
  })
}
async function computerCertificates() {
  if (systemCertificates) return systemCertificates
  let list = []
  try { list = tls.getCACertificates?.('system') || [] } catch { list = [] }
  if (!list.length && process.platform === 'win32') list = await windowsRootCertificates()
  systemCertificates = list
  return list
}

/** Downloads Google's public keys (trusting this computer's certificates too when needed). */
export async function downloadGoogleKeys({ get = getJson, extraCertificates = computerCertificates } = {}) {
  try {
    return await get(GOOGLE_CERTS)
  } catch (error) {
    if (!CERT_ERROR.test(String(error?.code || ''))) throw error
    const extra = await extraCertificates()
    if (!extra.length) throw error
    return get(GOOGLE_CERTS, { ca: [...new Set([...tls.rootCertificates, ...extra])] })
  }
}

/** Google's public keys, cached for as long as Google says (Cache-Control max-age). */
export function googleKeyStore({ fetchKeys = downloadGoogleKeys, log = console } = {}) {
  let cache = { until: 0, keys: new Map() }
  const load = async () => {
    let response
    try {
      response = await fetchKeys()
    } catch (error) {
      const problem = googleNetworkError(error)
      log.warn?.(`[google] ${problem.message}${error?.message && !problem.message.includes(error.message) ? ` — ${error.message}` : ''}`)
      throw problem
    }
    if (!response.ok) throw fail(`Google’s sign-in keys could not be fetched (HTTP ${response.status || '?'}). Please try again.`, 503)
    const body = await response.json()
    const maxAge = Number(String(response.headers?.get?.('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600)
    cache = { until: Date.now() + Math.min(maxAge, 86400) * 1000, keys: new Map((body.keys || []).map((jwk) => [jwk.kid, createPublicKey({ key: jwk, format: 'jwk' })])) }
    return cache.keys.size
  }
  const keyFor = async (kid) => {
    if (Date.now() > cache.until || !cache.keys.has(kid)) {
      try { await load() } catch (error) { if (!cache.keys.has(kid)) throw error } // a slightly old key still works if Google can't be reached
    }
    const key = cache.keys.get(kid)
    if (!key) throw fail('This Google sign-in could not be checked. Please try again.')
    return key
  }
  keyFor.refresh = load
  return keyFor
}

/** Checks a Google ID token; returns { email, name, picture, sub } or throws with a plain message. */
export async function verifyGoogleToken(token, { clientId, keyFor, now = Date.now() }) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw fail('Google sign-in did not return a valid answer.', 400)
  let header, payload
  try { header = decode(parts[0]); payload = decode(parts[1]) } catch { throw fail('Google sign-in did not return a valid answer.', 400) }
  if (header.alg !== 'RS256' || !header.kid) throw fail('Google sign-in did not return a valid answer.', 400)
  const key = await keyFor(header.kid)
  const signed = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))
  if (!signed) throw fail('This Google sign-in could not be confirmed.')
  if (!ISSUERS.includes(payload.iss)) throw fail('This sign-in did not come from Google.')
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(clientId)) throw fail('This Google sign-in was made for a different app.')
  const seconds = Math.floor(now / 1000)
  if (!payload.exp || Number(payload.exp) + SKEW_SECONDS < seconds) throw fail('This Google sign-in has expired. Please try again.')
  if (payload.iat && Number(payload.iat) - SKEW_SECONDS > seconds) throw fail('This Google sign-in is not valid yet. Check the computer’s clock.')
  if (!payload.email) throw fail('Google did not share an email address.')
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw fail('This Google account’s email is not verified.')
  return { email: String(payload.email).toLowerCase(), name: String(payload.name || '').slice(0, 120), picture: /^https:\/\//.test(payload.picture || '') ? String(payload.picture) : '', sub: String(payload.sub || '') }
}

export function createGoogleAuth({ envFile, env = process.env, fetchKeys, log = console } = {}) {
  const value = envReader(envFile, env)
  const keyFor = googleKeyStore({ ...(fetchKeys ? { fetchKeys } : {}), log })
  const clientId = () => { const id = value('GOOGLE_CLIENT_ID'); return CLIENT_ID.test(id) ? id : '' }

  const send = (res, status, payload) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => { size += chunk.length; if (size > MAX_BODY) { reject(fail('Request too large', 413)); req.destroy() } else chunks.push(chunk) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { reject(fail('Invalid JSON', 400)) } })
    req.on('error', reject)
  })

  const handle = async (req, res, next = () => send(res, 404, { error: 'Not found' })) => {
    const path = String(req.url || '').split('?')[0]
    if (!path.startsWith('/api/auth/google/')) return next()
    try {
      if (path === '/api/auth/google/config' && req.method === 'GET') return send(res, 200, { enabled: Boolean(clientId()), clientId: clientId() })
      if (path === '/api/auth/google/check' && req.method === 'GET') return send(res, 200, await check())
      if (path === '/api/auth/google/verify' && req.method === 'POST') {
        const id = clientId()
        if (!id) return send(res, 503, { error: 'Google sign-in is not set up yet (GOOGLE_CLIENT_ID in env/backend.env).', code: 'not-configured' })
        const body = await readBody(req)
        const profile = await verifyGoogleToken(body?.credential, { clientId: id, keyFor })
        return send(res, 200, { ok: true, ...profile })
      }
      return send(res, 404, { error: 'Not found' })
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || 'Google sign-in failed.' })
    }
  }

  /** Can this computer download Google's keys? → { ok, keys, clientId } or { ok: false, error } */
  const check = async () => {
    try { return { ok: true, keys: await keyFor.refresh(), clientId: Boolean(clientId()) } } catch (error) { return { ok: false, error: error.message, clientId: Boolean(clientId()) } }
  }

  return { handle, clientId, check }
}
