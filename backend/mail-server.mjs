/* Stand-alone mail server — only needed when the built app is hosted somewhere
   (during `npm run dev` the same API already runs inside Vite).

     npm run mail-server        start on 127.0.0.1:8787
     npm run mail-check         test the email + password in env/backend.env and exit
     npm run google-check       test that this computer can check "Continue with Google" sign-ins

   It also checks "Continue with Google" sign-ins (/api/auth/google).
   Put it behind the same domain as the app (e.g. a reverse proxy for /api/mail and /api/auth),
   and set MAIL_API_TOKEN (and VITE_MAIL_API_TOKEN for the app) if it is reachable from outside. */
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { createMailApi, describeMailCheck, parseEnv } from './mailApi.mjs'
import { createGoogleAuth } from './googleAuth.mjs'
import { existsSync, readFileSync } from 'node:fs'

const envFile = fileURLToPath(new URL('../env/backend.env', import.meta.url))
if (existsSync(fileURLToPath(new URL('../server/.env', import.meta.url)))) console.warn('Found server/.env — the settings now live in env/backend.env. Copy any changes there.\n')
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
const api = createMailApi({ envFile })
const google = createGoogleAuth({ envFile })

if (process.argv.includes('--google-check')) {
  const result = await google.check()
  console.log(result.ok
    ? `✓ This computer can check Google sign-ins (${result.keys} keys downloaded from Google).`
    : `✗ ${result.error}`)
  if (!result.clientId) console.log('✗ GOOGLE_CLIENT_ID is missing or looks wrong in env/backend.env.')
  else console.log('✓ GOOGLE_CLIENT_ID is set in env/backend.env.')
  api.close()
  process.exit(result.ok && result.clientId ? 0 : 1)
}

if (process.argv.includes('--check')) {
  const result = await api.verify()
  console.log(describeMailCheck(result, { pass: fileEnv.SMTP_PASS ?? process.env.SMTP_PASS ?? '' }).join('\n'))
  api.close()
  process.exit(result.ok ? 0 : 1)
}

const host = fileEnv.MAIL_SERVER_HOST || process.env.MAIL_SERVER_HOST || '127.0.0.1'
const port = Number(fileEnv.MAIL_SERVER_PORT || process.env.MAIL_SERVER_PORT || 8787)
http.createServer((req, res) => google.handle(req, res, () => api.handle(req, res))).listen(port, host, () => {
  const state = api.status()
  console.log(`GJIMT mail server on http://${host}:${port}/api/mail — ${state.configured ? `sending as ${state.from}` : 'waiting for SMTP_USER / SMTP_PASS in env/backend.env'}`)
  console.log(`Continue with Google: ${google.clientId() ? 'on' : 'off (add GOOGLE_CLIENT_ID to env/backend.env)'} — /api/auth/google`)
})
