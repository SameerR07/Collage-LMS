/* =========================================================
   Mail API — sends the LMS emails over SMTP (Nodemailer).

   Runs inside `npm run dev` / `npm run preview` (see vite.config.js),
   or on its own with `npm run mail-server` when the app is hosted.

   Settings come from env/backend.env (never sent to the browser):
     SMTP_USER / SMTP_PASS   the sending email and its password
                             (Gmail: a 16-letter App Password)
     SMTP_HOST / SMTP_PORT   default smtp.gmail.com : 465
     PLACEMENT_CELL_EMAIL    who gets "new student registered" alerts
                             (comma-separated; default: SMTP_USER)
     APP_URL                 optional, e.g. https://lms.gjimt.ac.in — adds an
                             "Open the student portal" button to student emails
   The file is re-read automatically when it changes — no restart.

   Endpoints
     GET  /api/mail/status      { configured, from, host }
     POST /api/mail/drive       { drive, recipients[], update } → { results[] }
     POST /api/mail/notify      { kind, data, recipients[] }    → { results[] }
     POST /api/mail/code/send   { email, name, purpose }        → { token, minutes }
     POST /api/mail/code/check  { email, code, token, purpose } → { ok }
   Emails are only ever built from the shared templates
   (frontend/src/lib/driveEmail.js, frontend/src/lib/notifyEmail.js).
========================================================= */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import nodemailer from 'nodemailer'
import { DRIVE_EMAIL_FIELDS, DRIVE_TEXT_LIMIT, buildDriveEmail, parseCourses } from '../frontend/src/lib/driveEmail.js'
import { NOTIFY_KINDS, buildNotifyEmail, isNotifyKind } from '../frontend/src/lib/notifyEmail.js'
import { parseEnv } from './env.mjs'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_RECIPIENTS_PER_REQUEST = 50
const MAX_BODY_BYTES = 512 * 1024
const CODE_MINUTES = 15
const CODE_PURPOSES = ['signup', 'reset']
const MAX_CODE_TRIES = 5

export { parseEnv }

const maskEmail = (email) => {
  const [user, domain] = String(email).split('@')
  if (!domain) return ''
  return `${user.slice(0, 2)}${'•'.repeat(Math.min(6, Math.max(2, user.length - 2)))}@${domain}`
}

export function createMailApi({ envFile, env = process.env, log = console } = {}) {
  let cache = { mtime: -1, settings: null, transporter: null }
  const createTransporter = (next) => nodemailer.createTransport({ host: next.host, port: next.port, secure: next.secure, auth: { user: next.user, pass: next.pass }, pool: true, maxConnections: 2, maxMessages: 100 })

  const settings = () => {
    let fileValues = {}
    let mtime = 0
    if (envFile && existsSync(envFile)) {
      mtime = statSync(envFile).mtimeMs
      if (mtime === cache.mtime && cache.settings) return cache.settings
      fileValues = parseEnv(readFileSync(envFile, 'utf8'))
    } else if (cache.settings && cache.mtime === 0) return cache.settings
    const value = (key, fallback = '') => String(fileValues[key] ?? env[key] ?? fallback).trim()
    const port = Number(value('SMTP_PORT', '465')) || 465
    const next = {
      host: value('SMTP_HOST', 'smtp.gmail.com'),
      port,
      secure: value('SMTP_SECURE') ? value('SMTP_SECURE').toLowerCase() === 'true' : port === 465,
      user: value('SMTP_USER'),
      pass: value('SMTP_PASS').replace(/\s+/g, ''), // Gmail shows App Passwords in groups of four
      fromName: value('MAIL_FROM_NAME', 'GJIMT Placement Cell'),
      replyTo: value('MAIL_REPLY_TO'),
      token: value('MAIL_API_TOKEN'),
      delayMs: Number(value('MAIL_DELAY_MS', '300')) || 0,
      staffEmails: value('PLACEMENT_CELL_EMAIL').split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter((item) => EMAIL.test(item)),
      appUrl: /^https?:\/\/[^\s]+$/i.test(value('APP_URL')) ? value('APP_URL').replace(/\/+$/, '') : '',
    }
    next.configured = Boolean(next.user && next.pass)
    if (cache.transporter) cache.transporter.close()
    cache = {
      mtime,
      settings: next,
      transporter: next.configured ? createTransporter(next) : null,
    }
    return next
  }

  const status = () => {
    const current = settings()
    return { ok: true, configured: current.configured, from: current.configured ? maskEmail(current.user) : '', host: current.host }
  }

  /** Validate the drive and recipients the app sent; returns a clean copy or throws. */
  const cleanRequest = (body) => {
    const drive = {}
    DRIVE_EMAIL_FIELDS.forEach((key) => { drive[key] = String(body?.drive?.[key] ?? '').slice(0, DRIVE_TEXT_LIMIT) })
    if (!drive.company || !drive.role || !drive.driveDate) throw Object.assign(new Error('The drive needs a company, job role and date.'), { status: 400 })
    if (!parseCourses(drive.eligible).length) throw Object.assign(new Error('The drive has no eligible course.'), { status: 400 })
    const list = Array.isArray(body?.recipients) ? body.recipients : []
    if (!list.length) throw Object.assign(new Error('No recipients.'), { status: 400 })
    if (list.length > MAX_RECIPIENTS_PER_REQUEST) throw Object.assign(new Error(`Send at most ${MAX_RECIPIENTS_PER_REQUEST} emails per request.`), { status: 413 })
    const recipients = list.map((item) => ({
      email: String(item?.email ?? '').trim().toLowerCase(),
      name: String(item?.name ?? '').slice(0, 120),
      course: String(item?.course ?? '').slice(0, 40),
    }))
    return { drive, recipients, update: Boolean(body?.update) }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const notConfigured = () => Object.assign(new Error('Email is not set up yet. Add SMTP_USER and SMTP_PASS to env/backend.env.'), { status: 503, code: 'not-configured' })

  /** One message to one person → { email, ok, error }. */
  const deliver = async (current, to, message, retried = false) => {
    try {
      const info = await cache.transporter.sendMail({
        from: { name: current.fromName, address: current.user },
        to: to.name ? { name: to.name, address: to.email } : to.email,
        replyTo: current.replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
      const rejected = (info.rejected || []).length > 0
      return { email: to.email, ok: !rejected, error: rejected ? 'Rejected by the mail server' : '' }
    } catch (error) {
      const problem = smtpProblem(error)
      // A connection kept open between sends can be dropped silently by the network (Wi-Fi, router, antivirus).
      // Start a fresh connection and try once more before calling the mail server unreachable.
      if (problem === 'connection' && !retried) {
        log.warn?.(`[mail] connection lost${error?.code ? ` (${error.code})` : ''} — reconnecting`)
        cache.transporter.close()
        cache.transporter = createTransporter(current)
        return deliver(current, to, message, true)
      }
      if (problem) log.warn?.(`[mail] ${problem === 'connection' ? `mail server not reachable${error?.code ? ` (${error.code})` : ''}` : 'login refused'}${smtpReply(error) ? ` — ${smtpReply(error)}` : ''}`)
      return { email: to.email, ok: false, error: friendlySmtpError(error), setup: problem }
    }
  }

  /**
   * Sends the same template to each recipient, stopping early on a setup problem (wrong password, no connection).
   * Results carry setup: 'login' | 'app-password' | 'connection' when the email didn't go because of env/backend.env,
   * not because of the person — those emails should wait and be sent again once it's fixed.
   */
  const sendEach = async (current, recipients, build) => {
    const results = []
    for (const [index, person] of recipients.entries()) {
      if (!EMAIL.test(person.email)) { results.push({ email: person.email, ok: false, error: 'Invalid email address' }); continue }
      const result = await deliver(current, person, build(person))
      results.push(result.setup ? { email: result.email, ok: false, error: result.error, setup: result.setup } : { email: result.email, ok: result.ok, error: result.error })
      if (result.setup) { // no point trying the rest of this batch
        recipients.slice(index + 1).forEach((rest) => results.push({ email: rest.email, ok: false, error: result.error, setup: result.setup }))
        break
      }
      if (current.delayMs && index < recipients.length - 1) await wait(current.delayMs)
    }
    return results
  }

  const cleanRecipients = (list) => {
    const items = Array.isArray(list) ? list : []
    if (!items.length) throw Object.assign(new Error('No recipients.'), { status: 400 })
    if (items.length > MAX_RECIPIENTS_PER_REQUEST) throw Object.assign(new Error(`Send at most ${MAX_RECIPIENTS_PER_REQUEST} emails per request.`), { status: 413 })
    return items.map((item) => ({ email: String(item?.email ?? '').trim().toLowerCase(), name: String(item?.name ?? '').slice(0, 120) }))
  }

  /** Student / Placement Cell notifications from the shared templates. Staff alerts go to PLACEMENT_CELL_EMAIL. */
  const sendNotify = async (body) => {
    const current = settings()
    if (!current.configured) throw notConfigured()
    const kind = String(body?.kind || '')
    if (!isNotifyKind(kind) || NOTIFY_KINDS[kind].serverOnly) throw Object.assign(new Error('Unknown email kind.'), { status: 400 })
    const recipients = NOTIFY_KINDS[kind].toStaff
      ? (current.staffEmails.length ? current.staffEmails : [current.user]).map((email) => ({ email, name: 'Placement Cell' }))
      : cleanRecipients(body?.recipients)
    const options = { senderName: current.fromName, portalUrl: current.appUrl ? `${current.appUrl}/login?as=student` : '' }
    const results = await sendEach(current, recipients, (person) => buildNotifyEmail(kind, body?.data || {}, person, options))
    // Staff alerts: report one combined result back to the queue entry
    if (NOTIFY_KINDS[kind].toStaff) {
      const ok = results.some((result) => result.ok)
      return { results: [{ email: String(body?.recipients?.[0]?.email || 'placement-cell'), ok, error: ok ? '' : results[0]?.error || 'Not sent', ...(!ok && results[0]?.setup ? { setup: results[0].setup } : {}) }] }
    }
    log.info?.(`[mail] ${kind} — ${results.filter((result) => result.ok).length}/${results.length} sent`)
    return { results }
  }

  /* ---- Email verification codes (student sign-up, password reset) ----
     The code is emailed; the browser only gets a signed token, so it never sees the code itself. */
  const codeSecret = randomBytes(32)
  const codeTries = new Map() // token → wrong attempts
  const codeSends = new Map() // email → [timestamps]
  const sign = (purpose, email, code, expires, nonce) => createHmac('sha256', codeSecret).update(`${purpose}|${email}|${code}|${expires}|${nonce}`).digest('hex')

  const sendCode = async (body) => {
    const current = settings()
    if (!current.configured) throw notConfigured()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const purpose = CODE_PURPOSES.includes(body?.purpose) ? body.purpose : 'signup'
    if (!EMAIL.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
    const now = Date.now()
    const recent = (codeSends.get(email) || []).filter((time) => now - time < 10 * 60 * 1000)
    if (recent.length && now - recent[recent.length - 1] < 30 * 1000) throw Object.assign(new Error('Please wait 30 seconds before asking for another code.'), { status: 429 })
    if (recent.length >= 4) throw Object.assign(new Error('Too many codes asked for this email. Try again in 10 minutes.'), { status: 429 })
    const code = String(randomInt(0, 1000000)).padStart(6, '0')
    const expires = now + CODE_MINUTES * 60 * 1000
    const nonce = randomBytes(8).toString('hex')
    const message = buildNotifyEmail('code', { code, purpose, minutes: String(CODE_MINUTES) }, { email, name: String(body?.name ?? '').slice(0, 120) }, { senderName: current.fromName })
    const result = await deliver(current, { email, name: String(body?.name ?? '').slice(0, 120) }, message)
    if (!result.ok && result.setup) throw Object.assign(new Error('The LMS can’t send emails right now, so the code was not sent. Please try again later or tell the Placement Cell.'), { status: 503, code: 'mail-setup' })
    if (!result.ok) throw Object.assign(new Error(result.error || 'The code could not be sent.'), { status: 502 })
    codeSends.set(email, [...recent, now])
    return { ok: true, token: `${expires}.${nonce}.${sign(purpose, email, code, expires, nonce)}`, minutes: CODE_MINUTES }
  }

  const checkCode = (body) => {
    const email = String(body?.email ?? '').trim().toLowerCase()
    const purpose = CODE_PURPOSES.includes(body?.purpose) ? body.purpose : 'signup'
    const code = String(body?.code ?? '').replace(/\D/g, '')
    const token = String(body?.token ?? '')
    const [expiresText, nonce, mac] = token.split('.')
    const expires = Number(expiresText)
    if (!nonce || !mac || !Number.isFinite(expires)) throw Object.assign(new Error('Ask for a new code.'), { status: 400 })
    if (Date.now() > expires) throw Object.assign(new Error('This code has expired. Ask for a new one.'), { status: 400 })
    const tries = codeTries.get(token) || 0
    if (tries >= MAX_CODE_TRIES) throw Object.assign(new Error('Too many wrong tries. Ask for a new code.'), { status: 429 })
    const expected = Buffer.from(sign(purpose, email, code, expires, nonce), 'hex')
    const given = Buffer.from(mac, 'hex')
    if (code.length !== 6 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      codeTries.set(token, tries + 1)
      throw Object.assign(new Error(`That code is not right.${MAX_CODE_TRIES - tries - 1 > 0 ? ` ${MAX_CODE_TRIES - tries - 1} tries left.` : ''}`), { status: 400 })
    }
    codeTries.set(token, MAX_CODE_TRIES) // a code works once
    return { ok: true }
  }

  /** Sends one personal email per student. Returns [{ email, ok, error }]. */
  const sendDrive = async (body) => {
    const current = settings()
    if (!current.configured) throw notConfigured()
    const { drive, recipients, update } = cleanRequest(body)
    const results = await sendEach(current, recipients, (student) => buildDriveEmail(drive, student, { update, senderName: current.fromName }))
    const sent = results.filter((result) => result.ok).length
    log.info?.(`[mail] ${drive.company} — ${sent}/${results.length} sent`)
    return { results }
  }

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy() } else chunks.push(chunk)
    })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })) } })
    req.on('error', reject)
  })

  const send = (res, status, payload) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  /** Connect/Node style handler: handles /api/mail/* and passes everything else on. */
  const handle = async (req, res, next = () => send(res, 404, { error: 'Not found' })) => {
    const path = String(req.url || '').split('?')[0]
    if (!path.startsWith('/api/mail/')) return next()
    try {
      const current = settings()
      if (current.token && req.headers['x-mail-token'] !== current.token) return send(res, 401, { error: 'Not allowed' })
      if (path === '/api/mail/status' && req.method === 'GET') return send(res, 200, status())
      const routes = { '/api/mail/drive': sendDrive, '/api/mail/notify': sendNotify, '/api/mail/code/send': sendCode, '/api/mail/code/check': checkCode }
      if (routes[path] && req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Send JSON' })
        return send(res, 200, await routes[path](await readBody(req)))
      }
      return send(res, 404, { error: 'Not found' })
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || 'Mail error', code: error.code || '' })
    }
  }

  const verify = async () => {
    const current = settings()
    if (!current.configured) return { ok: false, error: 'SMTP_USER and SMTP_PASS are not set in env/backend.env' }
    try { await cache.transporter.verify(); return { ok: true, from: current.user, host: current.host } } catch (error) {
      return { ok: false, error: friendlySmtpError(error), problem: smtpProblem(error), reply: smtpReply(error), user: current.user, host: current.host, port: current.port }
    }
  }

  return { handle, status, verify, close: () => cache.transporter?.close() }
}

/**
 * Plain-language report for `npm run mail-check`. Never includes the password itself —
 * only its length and whether it has the shape of an App Password (16 letters).
 */
export function describeMailCheck(result, { pass = '' } = {}) {
  if (result.ok) return [`✓ Email works: ${result.from} via ${result.host}`, '  Emails waiting in the LMS go out the next time the Placement Cell opens it (or press “Send waiting emails” on the Emails page).']
  const problem = result.problem || ''
  if (!['login', 'app-password', 'connection'].includes(problem)) return [`✗ ${result.error}`]
  const gmail = /gmail|google/i.test(result.host || '')
  const where = `${result.host}:${result.port}`
  if (problem === 'connection') {
    return [
      `✗ Could not reach the mail server (${where}).`,
      '  Check the internet connection. Some college or office networks block email ports:',
      '  try a phone hotspot, or put SMTP_PORT=587 and SMTP_SECURE=false in env/backend.env.',
    ]
  }
  const clean = String(pass).replace(/\s+/g, '')
  const shapeOk = /^[a-z]{16}$/i.test(clean)
  const lines = [
    `✗ ${gmail ? 'Gmail' : 'The mail server'} refused the login for ${result.user}.`,
    ...(result.reply ? [`  Its answer: ${result.reply}`] : []),
    '',
    '  What env/backend.env has:',
    `    SMTP_USER = ${result.user}`,
    `    SMTP_PASS = ${clean.length} character${clean.length === 1 ? '' : 's'} ${shapeOk ? '✓ (the shape of an App Password)' : '✗ (a Gmail App Password is exactly 16 letters)'}`,
    '',
  ]
  if (!gmail) return [...lines, '  Check SMTP_USER and SMTP_PASS with whoever runs this mail server.']
  if (problem === 'app-password') lines.push('  SMTP_PASS is the normal Gmail password. Gmail only accepts an App Password here.')
  else if (shapeOk) lines.push('  The App Password is not valid for this account: it was deleted or replaced, typed wrongly,', '  or made while signed in to a different Google account. (Changing the Google password also deletes all App Passwords.)')
  else lines.push('  SMTP_PASS is not an App Password.')
  return [
    ...lines,
    '',
    '  To fix it:',
    `    1. Sign in to Google as ${result.user}`,
    '    2. Open https://myaccount.google.com/apppasswords and create a new one (name it "GJIMT LMS").',
    '       If that page says the setting is not available, turn on 2-Step Verification first.',
    '    3. In env/backend.env replace everything after SMTP_PASS= with the new 16 letters, and save.',
    '    4. Run  npm run mail-check  again. The LMS picks up the change without a restart.',
  ]
}

/**
 * What kind of problem an SMTP error is:
 *   'app-password'  Gmail wants an App Password (the normal Gmail password was used)
 *   'login'         the mail server refused SMTP_USER / SMTP_PASS
 *   'connection'    the mail server could not be reached
 *   ''              something about this one message or person
 * 'app-password', 'login' and 'connection' are setup problems: no email can go out until env/backend.env is fixed.
 */
export function smtpProblem(error) {
  const code = error?.code || ''
  const response = String(error?.response || error?.message || '')
  if (/\b534\b|5\.7\.9|Application-specific password/i.test(response)) return 'app-password'
  if (code === 'EAUTH' || /\b535\b|Username and Password not accepted|BadCredentials/i.test(response)) return 'login'
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'].includes(code)) return 'connection'
  return ''
}

/** The first line of the mail server's own answer (e.g. "535-5.7.8 Username and Password not accepted…"), for the check. */
export function smtpReply(error) {
  return String(error?.response || '').split(/\r?\n/)[0].replace(/\s*For more information.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

export function friendlySmtpError(error) {
  const problem = smtpProblem(error)
  const response = String(error?.response || error?.message || '')
  if (problem === 'app-password') return 'Gmail needs an App Password, not the normal Gmail password. Create one at myaccount.google.com/apppasswords and put it in SMTP_PASS in env/backend.env.'
  if (problem === 'login') return 'The email or password was not accepted. For Gmail, use a 16-letter App Password (Google Account → Security → App passwords) made for the SMTP_USER account.'
  if (problem === 'connection') return 'Could not reach the mail server. Check the internet connection and SMTP_HOST / SMTP_PORT.'
  if (/550|553|invalid|does not exist|no such user/i.test(response)) return 'This address was refused by the mail server.'
  if (/daily|limit|quota|421|452/i.test(response)) return 'The mail server’s sending limit was reached. Try again later.'
  return response.split('\n')[0].slice(0, 200) || 'Email could not be sent.'
}
