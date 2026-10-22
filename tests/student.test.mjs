// Student portal rules + student/notification emails — run with:  npm test
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applicationId, canWithdraw, cleanRegistration, codeMatches, driveEligibility, findStudentByEmail, inAudience, makeCode, markId, maskEmail,
  registrationFields, registrationProblems, registrationProgress, sessionAudience, sessionCounts, statusFromInterest, studentAttendance,
} from '../frontend/src/lib/studentRules.js'
import { NOTIFY_KINDS, buildNotifyEmail, cleanNotifyData } from '../frontend/src/lib/notifyEmail.js'
import { createMailApi } from '../backend/mailApi.mjs'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }

const S = (over = {}) => ({ id: 's1', name: 'Aman Gill', email: 'aman.gill@gmail.com', rollNo: '2523101', course: 'MBA', batch: '2025-27', placementStatus: 'Eligible', phone: '9876543210', tenthPercent: '72', twelfthPercent: '68', graduationPercent: '61', specialization: 'Marketing', ...over })
const fullForm = (over = {}) => ({ name: 'Neha Rani', rollNo: '2523199', course: 'BCA', batch: '2024-27', email: 'neha@gmail.com', phone: '+91 98765 43210', fatherName: 'Ram Lal', address: 'Ward 4, Mohali', state: 'Punjab', tenthPercent: '81', twelfthPercent: '77', placementInterest: 'Yes', ...over })
const TODAY = '2026-10-09'

console.log('Same email = same student')
await test('Master Data record found by email, ignoring capitals and spaces', () => {
  const students = [S(), S({ id: 's2', email: 'Riya@Demo.edu ' })]
  assert.equal(findStudentByEmail(students, ' AMAN.GILL@gmail.com ').id, 's1')
  assert.equal(findStudentByEmail(students, 'riya@demo.edu').id, 's2')
  assert.equal(findStudentByEmail(students, 'nobody@x.in'), null)
  assert.equal(findStudentByEmail(students, ''), null)
  assert.equal(maskEmail('aman.gill@gmail.com'), 'am••••••@gmail.com')
})

console.log('Registration form (full Master Data details)')
await test('students never see staff fields; PG courses must give graduation details', () => {
  const keys = registrationFields({ course: 'BCA' }).map((field) => field.key)
  assert.ok(!keys.includes('placementStatus') && !keys.includes('company'), 'no staff fields')
  assert.ok(keys.includes('fatherName') && keys.includes('jobArea3'), 'the full registration sheet')
  const required = (course) => registrationFields({ course }).filter((field) => field.required).map((field) => field.key)
  assert.ok(!required('BCA').includes('graduationPercent'))
  assert.ok(required('MBA').includes('graduationPercent') && required('MCA').includes('graduationDegree'))
})
await test('missing and wrong details are reported per field', () => {
  const problems = registrationProblems({ name: '', email: 'neha@gmail.com', course: 'MBA', phone: '12345', tenthPercent: '140', cgpa: '11' })
  assert.match(problems.name, /required/); assert.match(problems.rollNo, /required/); assert.match(problems.fatherName, /required/)
  assert.match(problems.phone, /10-digit/); assert.match(problems.tenthPercent, /0 to 100/); assert.match(problems.cgpa, /0 to 10/)
  assert.match(problems.graduationPercent, /required/, 'MBA needs graduation marks')
  assert.deepEqual(registrationProblems(fullForm()), {})
})
await test('cleaned values: email lower case, phone as 10 digits', () => {
  const clean = cleanRegistration(fullForm({ email: ' Neha@Gmail.com ', phone: '+91 98765-43210', tenthPercent: '81%' }))
  assert.equal(clean.email, 'neha@gmail.com'); assert.equal(clean.phone, '9876543210'); assert.equal(clean.tenthPercent, '81')
})
await test('a roll number that belongs to another email is refused (no duplicate students)', () => {
  const students = [S({ rollNo: '2523199', email: 'other.person@gmail.com' })]
  assert.match(registrationProblems(fullForm(), { students }).rollNo, /already in Master Data with another email \(ot••••••@gmail\.com\)/)
  assert.deepEqual(registrationProblems(fullForm(), { students: [S({ id: 'me', rollNo: '2523199', email: 'neha@gmail.com' })], selfId: 'me' }), {})
})
await test('“Interested: No” → Opted Out; back to Yes → Eligible; Placed is never changed', () => {
  assert.equal(statusFromInterest('Eligible', 'No'), 'Opted Out')
  assert.equal(statusFromInterest('Opted Out', 'Yes'), 'Eligible')
  assert.equal(statusFromInterest('Placed', 'No'), 'Placed')
  assert.equal(statusFromInterest('', 'Yes'), 'Eligible')
  assert.ok(registrationProgress(fullForm()) > 40 && registrationProgress({}) === 0)
})

console.log('Who may apply for a drive')
const drive = { id: 'd1', company: 'ICICI Bank', role: 'RM', eligible: 'MBA, MCA', driveDate: '2026-10-27', applyBy: '2026-10-20', status: 'Open', minTenth: '60', minTwelfth: '60', minGraduation: '55', applyMarks: 'Yes' }
await test('eligible student can apply', () => {
  const check = driveEligibility(drive, S(), TODAY)
  assert.equal(check.eligible, true); assert.equal(check.canApply, true); assert.deepEqual(check.reasons, [])
})
await test('clear reasons: course, batch, status, marks, specialization', () => {
  assert.match(driveEligibility(drive, S({ course: 'BCA' }), TODAY).reasons[0], /for MCA, MBA students/)
  assert.match(driveEligibility({ ...drive, batches: '2024-26' }, S(), TODAY).reasons[0], /batch 2024-26/)
  assert.match(driveEligibility(drive, S({ placementStatus: 'Opted Out' }), TODAY).reasons[0], /opted out/)
  assert.match(driveEligibility(drive, S({ tenthPercent: '55' }), TODAY).reasons[0], /Minimum Class X 60% — yours is 55%/)
  assert.match(driveEligibility({ ...drive, specialization: 'Finance', matchSpecialization: 'Yes' }, S(), TODAY).reasons[0], /Finance specialization/)
  assert.equal(driveEligibility(drive, S({ tenthPercent: '' }), TODAY).marksUnknown, true, 'missing marks still allowed, flagged')
})
await test('closed drives: status, last date, drive already over', () => {
  assert.match(driveEligibility({ ...drive, status: 'Closed' }, S(), TODAY).closedReason, /closed/)
  assert.match(driveEligibility(drive, S(), '2026-10-21').closedReason, /last date to apply \(20 October 2026\) has passed/)
  assert.match(driveEligibility(drive, S(), '2026-10-28').closedReason, /already taken place/)
  assert.equal(driveEligibility(drive, S(), '2026-10-21').canApply, false)
})
await test('one application per student per drive; only “Applied” can be withdrawn', () => {
  assert.equal(applicationId('d1', 'Aman.Gill@gmail.com'), 'd1__aman_gill_gmail_com')
  assert.equal(applicationId('d1', 'aman.gill@gmail.com '), applicationId('d1', 'AMAN.GILL@GMAIL.COM'))
  assert.ok(canWithdraw({ status: 'Applied' })); assert.ok(!canWithdraw({ status: 'Shortlisted' }))
})

console.log('Attendance')
await test('check-in codes: 6 easy-to-read characters, any case', () => {
  for (let i = 0; i < 50; i++) assert.match(makeCode(), /^[A-HJKMNP-Z2-9]{6}$/)
  assert.ok(codeMatches('ab c2 3d', 'ABC23D')); assert.ok(!codeMatches('ABC23E', 'ABC23D')); assert.ok(!codeMatches('ABC23D', ''))
  assert.equal(markId('sess1', 'A@B.in'), 'sess1__a_b_in')
})
await test('who is expected: courses + batch (not opted out), or the drive’s applicants', () => {
  const session = { id: 'x', courses: 'MBA', batches: '2025-27' }
  assert.ok(inAudience(session, S())); assert.ok(!inAudience(session, S({ course: 'BCA' }))); assert.ok(!inAudience(session, S({ batch: '2024-26' })))
  assert.ok(!inAudience(session, S({ placementStatus: 'Opted Out' })))
  const apps = [{ driveId: 'd1', studentEmail: 'aman.gill@gmail.com', status: 'Shortlisted' }, { driveId: 'd1', studentEmail: 'b@x.in', status: 'Withdrawn' }]
  const forApplicants = { audience: 'applicants', driveId: 'd1' }
  assert.ok(inAudience(forApplicants, S(), apps)); assert.ok(!inAudience(forApplicants, S({ email: 'b@x.in' }), apps))
  assert.deepEqual(sessionAudience(session, [S({ id: 'z', name: 'Zed' }), S({ id: 'a', name: 'Abha', email: 'abha@x.in' }), S({ id: 'c', course: 'BCA' })]).map((s) => s.name), ['Abha', 'Zed'])
})
await test('session counts and a student’s attendance %', () => {
  const audience = [S(), S({ email: 'b@x.in' }), S({ email: 'c@x.in' })]
  assert.deepEqual(sessionCounts(audience, [{ studentEmail: 'AMAN.GILL@gmail.com', status: 'Present' }, { studentEmail: 'b@x.in', status: 'Late' }]), { expected: 3, present: 1, late: 1, absent: 0, unmarked: 1 })
  const sessions = [
    { id: 'a', date: '2026-10-01', courses: 'MBA', checkIn: 'Closed' },
    { id: 'b', date: '2026-10-05', courses: 'MBA', checkIn: 'Closed' },
    { id: 'c', date: '2026-10-09', courses: 'MBA', checkIn: 'Open' },
    { id: 'd', date: '2026-10-20', courses: 'MBA', checkIn: 'Not started' },
    { id: 'e', date: '2026-10-02', courses: 'BCA', checkIn: 'Closed' },
  ]
  const result = studentAttendance(sessions, [{ sessionId: 'a', studentEmail: 'aman.gill@gmail.com', status: 'Present' }], S(), [], TODAY)
  assert.deepEqual(result.rows.map((row) => [row.session.id, row.status]), [['d', 'Upcoming'], ['c', 'Open now'], ['b', 'Absent'], ['a', 'Present']])
  assert.equal(result.percent, 50); assert.equal(result.attended, 1); assert.equal(result.total, 2)
})

console.log('Student emails (templates)')
await test('every kind builds a subject, plain text and HTML', () => {
  const data = { linked: 'Yes', rollNo: '2523101', course: 'MBA', batch: '2025-27', company: 'ICICI Bank', role: 'RM', status: 'Selected', driveDate: '2026-10-27', title: 'Aptitude training', kind: 'Training', date: '2026-10-12', code: '123456', studentName: 'Neha', studentEmail: 'neha@gmail.com' }
  for (const kind of Object.keys(NOTIFY_KINDS)) {
    const mail = buildNotifyEmail(kind, data, { name: 'Aman Gill', email: 'aman.gill@gmail.com' })
    assert.ok(mail.subject && mail.text.includes('GJIMT Placement Cell') && mail.html.startsWith('<!doctype html>'), kind)
  }
  assert.match(buildNotifyEmail('applicationStatus', data, { name: 'Aman' }).subject, /^Congratulations! ICICI Bank/)
  assert.match(buildNotifyEmail('welcome', { linked: 'No' }, { name: 'Neha' }).text, /complete your registration/)
  assert.match(buildNotifyEmail('newStudentAlert', data, {}).text, /^Hello Placement Cell,/)
})
await test('typed text is escaped, only known fields are kept, portal button only from APP_URL', () => {
  const mail = buildNotifyEmail('applicationStatus', { company: '<b>X</b>', role: 'R', status: 'Shortlisted', note: '<script>alert(1)</script>' }, { name: 'A' })
  assert.ok(!mail.html.includes('<script>') && mail.html.includes('&lt;script&gt;'))
  assert.deepEqual(Object.keys(cleanNotifyData('welcome', { linked: 'Yes', evil: 'x', html: '<p>' })), ['linked', 'rollNo', 'course', 'batch'])
  assert.ok(!buildNotifyEmail('welcome', {}, { name: 'A' }).html.includes('Open the student portal'))
  assert.ok(buildNotifyEmail('welcome', {}, { name: 'A' }, { portalUrl: 'https://lms.gjimt.ac.in/login?as=student' }).html.includes('https://lms.gjimt.ac.in/login?as=student'))
  assert.throws(() => buildNotifyEmail('nope', {}, {}), /Unknown/)
})

console.log('Mail API — notifications and codes (test mail server)')
// A tiny SMTP server that accepts everything and keeps the messages in memory
const inbox = []
const smtp = net.createServer((socket) => {
  let buffer = ''; let inData = false; let lines = []; let to = []; let step = null
  const say = (line) => socket.write(`${line}\r\n`)
  say('220 test')
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let index
    while ((index = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 2)
      if (inData) { if (line === '.') { inData = false; inbox.push({ to, raw: lines.join('\n') }); lines = []; say('250 OK') } else lines.push(line); continue }
      if (step) { step = step === 'user' ? 'pass' : null; say(step ? '334 UGFzc3dvcmQ6' : '235 OK'); continue }
      const cmd = line.slice(0, 4).toUpperCase()
      if (cmd === 'EHLO') { say('250-test'); say('250 AUTH PLAIN LOGIN') } else if (cmd === 'AUTH') { if (/PLAIN \S+/i.test(line)) say('235 OK'); else { step = 'user'; say('334 VXNlcm5hbWU6') } }
      else if (cmd === 'MAIL') { to = []; say('250 OK') } else if (cmd === 'RCPT') { to.push(line); say('250 OK') } else if (cmd === 'DATA') { inData = true; say('354 go') }
      else if (cmd === 'QUIT') { say('221 bye'); socket.end() } else say('250 OK')
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
const dir = mkdtempSync(join(tmpdir(), 'mail-student-'))
writeFileSync(join(dir, '.env'), `SMTP_HOST=127.0.0.1\nSMTP_PORT=${port}\nSMTP_SECURE=false\nSMTP_USER=placement.test@gmail.com\nSMTP_PASS=testpass\nMAIL_DELAY_MS=0\nPLACEMENT_CELL_EMAIL=cell@gjimt.ac.in, tpo@gjimt.ac.in\nAPP_URL=https://lms.gjimt.ac.in/\n`)
const api = createMailApi({ envFile: join(dir, '.env'), env: {}, log: {} })
const subjectOf = (raw) => (raw.match(/^Subject: (.*)$/m) || [])[1] || ''

await test('notify: student email sent from the template, with the portal button from APP_URL', async () => {
  inbox.length = 0
  const result = await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'welcome', data: { linked: 'Yes', rollNo: '2523101', course: 'MBA', batch: '2025-27' }, recipients: [{ name: 'Aman Gill', email: 'Aman.Gill@gmail.com' }] }))
  assert.equal(result.status, 200); assert.deepEqual(result.body.results, [{ email: 'aman.gill@gmail.com', ok: true, error: '' }])
  assert.equal(inbox.length, 1); assert.match(inbox[0].to[0], /aman\.gill@gmail\.com/)
  assert.match(subjectOf(inbox[0].raw), /student placement account is ready/)
  assert.match(inbox[0].raw.replace(/=\r?\n/g, ''), /https:\/\/lms\.gjimt\.ac\.in\/login\?as=3Dstudent|https:\/\/lms\.gjimt\.ac\.in\/login\?as=student/)
})
await test('notify: Placement Cell alerts go only to PLACEMENT_CELL_EMAIL (never to an address from the browser)', async () => {
  inbox.length = 0
  const result = await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'newStudentAlert', data: { studentName: 'Neha Rani', studentEmail: 'neha@gmail.com', course: 'BCA' }, recipients: [{ email: 'attacker@evil.com' }] }))
  assert.equal(result.status, 200); assert.equal(result.body.results.length, 1); assert.equal(result.body.results[0].ok, true)
  const rcpts = inbox.flatMap((mail) => mail.to).join(' ')
  assert.match(rcpts, /cell@gjimt\.ac\.in/); assert.match(rcpts, /tpo@gjimt\.ac\.in/); assert.ok(!/evil\.com/.test(rcpts))
})
await test('notify: unknown kinds and the code template are refused', async () => {
  assert.equal((await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'free-text', data: {}, recipients: [{ email: 'a@b.in' }] }))).status, 400)
  assert.equal((await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'code', data: { code: '000000' }, recipients: [{ email: 'a@b.in' }] }))).status, 400)
  assert.equal((await call(api, fakeReq('POST', '/api/mail/notify', { kind: 'welcome', data: {}, recipients: [] }))).status, 400)
})
await test('verification code: emailed, browser only gets a token, wrong code counted, works once', async () => {
  inbox.length = 0
  const sent = await call(api, fakeReq('POST', '/api/mail/code/send', { email: 'Neha@gmail.com', name: 'Neha', purpose: 'signup' }))
  assert.equal(sent.status, 200); assert.ok(sent.body.token && !JSON.stringify(sent.body).match(/\b\d{6}\b/), 'no code in the response')
  const code = (subjectOf(inbox[0].raw).match(/^(\d{6}) is your/) || [])[1]
  assert.match(code, /^\d{6}$/)
  const wrong = await call(api, fakeReq('POST', '/api/mail/code/check', { email: 'neha@gmail.com', code: code === '000000' ? '111111' : '000000', token: sent.body.token, purpose: 'signup' }))
  assert.equal(wrong.status, 400); assert.match(wrong.body.error, /not right\. 4 tries left/)
  assert.equal((await call(api, fakeReq('POST', '/api/mail/code/check', { email: 'neha@gmail.com', code, token: sent.body.token, purpose: 'reset' }))).status, 400, 'a sign-up code cannot reset a password')
  assert.equal((await call(api, fakeReq('POST', '/api/mail/code/check', { email: 'other@gmail.com', code, token: sent.body.token, purpose: 'signup' }))).status, 400, 'tied to the email')
  const ok = await call(api, fakeReq('POST', '/api/mail/code/check', { email: 'neha@gmail.com', code, token: sent.body.token, purpose: 'signup' }))
  assert.deepEqual(ok.body, { ok: true })
  assert.equal((await call(api, fakeReq('POST', '/api/mail/code/check', { email: 'neha@gmail.com', code, token: sent.body.token, purpose: 'signup' }))).status, 429, 'used once')
  assert.equal((await call(api, fakeReq('POST', '/api/mail/code/send', { email: 'neha@gmail.com', purpose: 'signup' }))).status, 429, 'wait 30 s between codes')
  assert.equal((await call(api, fakeReq('POST', '/api/mail/code/check', { email: 'neha@gmail.com', code, token: `1.${sent.body.token.split('.').slice(1).join('.')}`, purpose: 'signup' }))).status, 400, 'expired / tampered token')
})
await test('codes need email to be set up', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'mail-off-'))
  const off = createMailApi({ envFile: join(empty, '.env'), env: {}, log: {} })
  const result = await call(off, fakeReq('POST', '/api/mail/code/send', { email: 'a@b.in' }))
  assert.equal(result.status, 503); assert.equal(result.body.code, 'not-configured')
  off.close()
})
api.close()
smtp.close()
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
