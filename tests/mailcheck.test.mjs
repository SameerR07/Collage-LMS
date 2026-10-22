// When Gmail refuses the email login (wrong / deleted App Password). Run with:  npm test
import assert from 'node:assert/strict'
import net from 'node:net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMailApi, describeMailCheck, friendlySmtpError, smtpProblem, smtpReply } from '../backend/mailApi.mjs'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }

// A Gmail-like test server: refuses every login with Gmail's own answers
const GMAIL_535 = '535-5.7.8 Username and Password not accepted. For more information, go to\r\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials abc123 - gsmtp'
const GMAIL_534 = '534-5.7.9 Application-specific password required. For more information, go to\r\n534 5.7.9  https://support.google.com/mail/?p=InvalidSecondFactor abc123 - gsmtp'
let logins = 0
const smtp = net.createServer((socket) => {
  let buffer = ''
  const say = (line) => socket.write(`${line}\r\n`)
  say('220 smtp.test ESMTP')
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let index
    while ((index = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 2)
      const cmd = line.slice(0, 4).toUpperCase()
      if (cmd === 'EHLO') { say('250-smtp.test'); say('250 AUTH PLAIN LOGIN') }
      else if (cmd === 'AUTH') {
        logins += 1
        const [, user, pass] = Buffer.from(line.split(' ')[2] || '', 'base64').toString().split('\u0000')
        say(pass === 'MyNormalGmailPassword1' && user ? GMAIL_534 : GMAIL_535)
      } else if (cmd === 'QUIT') { say('221 bye'); socket.end() } else say('530 Authentication required')
    }
  })
  socket.on('error', () => {})
})
await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve))
const port = smtp.address().port

const fakeReq = (method, url, body) => {
  const listeners = {}
  const req = { method, url, headers: { 'content-type': 'application/json' }, on: (event, fn) => { listeners[event] = fn; return req }, destroy() {} }
  setTimeout(() => { if (body !== undefined) listeners.data?.(Buffer.from(JSON.stringify(body))); listeners.end?.() })
  return req
}
const call = (api, req) => new Promise((resolve) => {
  const res = { statusCode: 0, setHeader() {}, end: (text) => resolve({ status: res.statusCode, body: JSON.parse(text) }) }
  api.handle(req, res)
})
const apiWith = (pass, extra = '') => {
  const dir = mkdtempSync(join(tmpdir(), 'mailcheck-'))
  writeFileSync(join(dir, '.env'), `SMTP_HOST=127.0.0.1\nSMTP_PORT=${port}\nSMTP_SECURE=false\nSMTP_USER=placement.test@gmail.com\nSMTP_PASS=${pass}\nMAIL_DELAY_MS=0\n${extra}`)
  return createMailApi({ envFile: join(dir, '.env'), env: {}, log: {} })
}
const APP_PASSWORD = 'wxyz abcd efgh ijkl' // a made-up 16-letter App Password, as Google shows it

console.log('Gmail refuses the login')
await test('kinds of problem: login, normal password used, no connection, one bad address', () => {
  assert.equal(smtpProblem({ code: 'EAUTH', response: GMAIL_535 }), 'login')
  assert.equal(smtpProblem({ code: 'EAUTH', response: GMAIL_534 }), 'app-password')
  assert.equal(smtpProblem({ code: 'ETIMEDOUT' }), 'connection')
  assert.equal(smtpProblem({ code: 'ECONNREFUSED' }), 'connection')
  assert.equal(smtpProblem({ code: 'EENVELOPE', response: '550 5.1.1 The email account that you tried to reach does not exist' }), '')
  assert.equal(smtpReply({ response: GMAIL_535 }), '535-5.7.8 Username and Password not accepted.')
  assert.match(friendlySmtpError({ code: 'EAUTH', response: GMAIL_534 }), /needs an App Password, not the normal Gmail password/)
  assert.match(friendlySmtpError({ code: 'EAUTH', response: GMAIL_535 }), /not accepted.*App Password/)
})

await test('npm run mail-check: shows Google’s answer, the password’s shape (never the password) and the steps', async () => {
  const api = apiWith(APP_PASSWORD)
  const result = await api.verify()
  assert.equal(result.ok, false); assert.equal(result.problem, 'login')
  assert.equal(result.reply, '535-5.7.8 Username and Password not accepted.')
  assert.equal(result.user, 'placement.test@gmail.com')
  const text = describeMailCheck({ ...result, host: 'smtp.gmail.com' }, { pass: APP_PASSWORD }).join('\n')
  assert.match(text, /Gmail refused the login for placement\.test@gmail\.com/)
  assert.match(text, /Its answer: 535-5\.7\.8/)
  assert.match(text, /SMTP_PASS = 16 characters ✓/)
  assert.match(text, /deleted or replaced, typed wrongly,\s+or made while signed in to a different Google account/)
  assert.match(text, /myaccount\.google\.com\/apppasswords/)
  assert.ok(!text.includes('wxyz') && !text.includes('abcd'), 'the password is never printed')
  api.close()
})

await test('mail-check: the normal Gmail password, or something that isn’t 16 letters', async () => {
  const api = apiWith('MyNormalGmailPassword1')
  const result = await api.verify()
  assert.equal(result.problem, 'app-password')
  const text = describeMailCheck({ ...result, host: 'smtp.gmail.com' }, { pass: 'MyNormalGmailPassword1' }).join('\n')
  assert.match(text, /SMTP_PASS = 22 characters ✗ \(a Gmail App Password is exactly 16 letters\)/)
  assert.match(text, /SMTP_PASS is the normal Gmail password/)
  assert.ok(!text.includes('MyNormal'))
  api.close()
  const short = describeMailCheck({ ok: false, problem: 'login', user: 'a@gmail.com', host: 'smtp.gmail.com', port: 465, reply: '' }, { pass: 'abc' }).join('\n')
  assert.match(short, /3 characters ✗/); assert.match(short, /SMTP_PASS is not an App Password/)
})

await test('mail-check: mail server not reachable / working', async () => {
  const closed = net.createServer(); await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve)); const deadPort = closed.address().port; closed.close()
  const dir = mkdtempSync(join(tmpdir(), 'mailcheck-'))
  writeFileSync(join(dir, '.env'), `SMTP_HOST=127.0.0.1\nSMTP_PORT=${deadPort}\nSMTP_SECURE=false\nSMTP_USER=a@gmail.com\nSMTP_PASS=${APP_PASSWORD}\n`)
  const api = createMailApi({ envFile: join(dir, '.env'), env: {}, log: {} })
  const result = await api.verify()
  assert.equal(result.problem, 'connection')
  assert.match(describeMailCheck(result, {}).join('\n'), /Could not reach the mail server \(127\.0\.0\.1:\d+\).*\n.*\n.*SMTP_PORT=587/)
  api.close()
  assert.match(describeMailCheck({ ok: true, from: 'a@gmail.com', host: 'smtp.gmail.com' }).join('\n'), /✓ Email works: a@gmail\.com via smtp\.gmail\.com\n.*Send waiting emails/)
})

await test('sending: a refused login marks every result as a setup problem and stops after one try', async () => {
  const api = apiWith(APP_PASSWORD)
  logins = 0
  const people = Array.from({ length: 5 }, (_, i) => ({ name: `S${i}`, email: `s${i}@gmail.com` }))
  const result = await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'welcome', data: { linked: 'Yes' }, recipients: people }))
  assert.equal(result.status, 200)
  assert.equal(result.body.results.length, 5)
  assert.ok(result.body.results.every((item) => !item.ok && item.setup === 'login' && /not accepted/.test(item.error)))
  assert.ok(logins <= 2, `tried to log in ${logins} times`)
  const staff = await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'newStudentAlert', data: { studentName: 'N', studentEmail: 'n@gmail.com' }, recipients: [{ email: 'placement-cell' }] }))
  assert.equal(staff.body.results[0].setup, 'login', 'Placement Cell alerts too')
  const drive = await call(api, fakeReq('POST', '/api/mail/drive', { drive: { company: 'ICICI', role: 'RM', driveDate: '2026-10-20', eligible: 'MBA' }, recipients: [{ email: 'a@gmail.com' }, { email: 'b@gmail.com' }] }))
  assert.ok(drive.body.results.every((item) => item.setup === 'login'), 'drive emails too')
  api.close()
})

await test('sign-up / reset codes: students get a plain message, not server details', async () => {
  const api = apiWith(APP_PASSWORD)
  const result = await call(api, fakeReq('POST', '/api/mail/code/send', { email: 'neha@gmail.com', name: 'Neha', purpose: 'signup' }))
  assert.equal(result.status, 503); assert.equal(result.body.code, 'mail-setup')
  assert.match(result.body.error, /can’t send emails right now.*tell the Placement Cell/)
  assert.ok(!/SMTP|\.env|App Password/.test(result.body.error))
  api.close()
})

smtp.close()
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
