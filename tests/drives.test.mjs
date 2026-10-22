// Placement drive emails: who receives them, what they say, and the mail API — run with:  npm test
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_LEAVE_OUT, DRIVE_EMAIL_FIELDS, buildDriveEmail, driveDetailRows, driveEmailSubject, driveProblems, driveSections, emailCounts,
  formatDriveDate, formatTime, matchesSpecialization, normalizeUrl, parseCourses, roundsOf, selectRecipients,
} from '../frontend/src/lib/driveEmail.js'
import { createMailApi, friendlySmtpError, parseEnv } from '../backend/mailApi.mjs'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }

const drive = {
  company: 'TechNova Solutions', role: 'Graduate Trainee', ctc: '₹4.5 LPA', locations: 'Mohali, Chandigarh',
  driveDate: '2026-10-15', reportingTime: '09:30', venue: 'Seminar Hall, Block B', mode: 'On campus', roundsCount: '3',
  round1: 'Aptitude test', round2: 'Technical interview', round3: 'HR interview',
  eligible: 'BCA, MCA', requirements: '60% throughout\nGood communication', summary: 'Work on client web apps.',
}
const students = [
  { name: 'Aarav Sharma', course: 'BCA', batch: '2023-26', email: 'aarav@gmail.com', placementStatus: 'Eligible' },
  { name: 'Riya Verma', course: 'mca', batch: '2025-27', email: ' RIYA@gmail.com ', placementStatus: 'In Process' },
  { name: 'Karan Singh', course: 'BCA', batch: '2023-26', email: 'karan@gmail.com', placementStatus: 'Not Eligible' },
  { name: 'Mehak Arora', course: 'MCA', batch: '2025-27', email: 'mehak@gmail.com', placementStatus: 'Opted Out' },
  { name: 'Simran Kaur', course: 'BCA', batch: '2024-27', email: 'simran@gmail.com', placementStatus: 'Placed' },
  { name: 'No Email', course: 'MCA', batch: '2025-27', email: '', placementStatus: 'Eligible' },
  { name: 'Riya Again', course: 'MCA', batch: '2025-27', email: 'riya@gmail.com', placementStatus: 'Eligible' },
  { name: 'Bba Student', course: 'BBA', batch: '2023-26', email: 'bba@gmail.com', placementStatus: 'Eligible' },
  { name: 'Bcom Student', course: 'B Com', batch: '2024-27', email: 'bcom@gmail.com', placementStatus: 'Eligible' },
]

console.log('Who receives a drive email')
await test('courses: any spelling → standard names in standard order', () => {
  assert.deepEqual(parseCourses('mca, bcom ,BCA, xyz'), ['BCA', 'B.Com', 'MCA'])
  assert.deepEqual(parseCourses(['MBA', 'B.Com.']), ['B.Com', 'MBA'])
  assert.deepEqual(parseCourses(''), [])
})
await test('only ticked courses; opted out and not eligible left out by default; no email / repeats skipped', () => {
  const result = selectRecipients(students, { courses: ['BCA', 'MCA'] })
  assert.deepEqual(DEFAULT_LEAVE_OUT, ['Opted Out', 'Not Eligible'])
  assert.deepEqual(result.recipients.map((r) => r.email), ['aarav@gmail.com', 'riya@gmail.com', 'simran@gmail.com'])
  assert.deepEqual(result.byCourse, { BCA: 2, MCA: 1 })
  assert.deepEqual(result.skipped, { byStatus: { 'Not Eligible': 1, 'Opted Out': 1 }, noEmail: 1, duplicate: 1, otherBatch: 0, belowMarks: 0, specialization: 0 })
  assert.equal(result.inCourses, 7)
  assert.equal(result.recipients[1].course, 'MCA')
})
await test('leave out placed students too, limit to a batch, B.Com matches "B Com"', () => {
  assert.deepEqual(selectRecipients(students, { courses: 'BCA', leaveOut: ['Opted Out', 'Not Eligible', 'Placed'] }).recipients.map((r) => r.name), ['Aarav Sharma'])
  const batch = selectRecipients(students, { courses: 'BCA, MCA', batches: ['2025-27'] })
  assert.deepEqual(batch.recipients.map((r) => r.name), ['Riya Verma'])
  assert.equal(batch.skipped.otherBatch, 3)
  assert.deepEqual(selectRecipients(students, { courses: ['B.Com'] }).recipients.map((r) => r.email), ['bcom@gmail.com'])
  assert.deepEqual(selectRecipients(students, { courses: [] }).recipients, [])
})

console.log('The email itself')
await test('dates, times and rounds read naturally', () => {
  assert.equal(formatDriveDate('2026-10-15'), 'Thursday, 15 October 2026')
  assert.equal(formatTime('09:30'), '9:30 AM'); assert.equal(formatTime('14:05'), '2:05 PM'); assert.equal(formatTime('00:15'), '12:15 AM')
  assert.deepEqual(roundsOf({ roundsCount: '2', round1: 'Test', round2: '' }), ['Test', 'Round 2'])
  assert.deepEqual(roundsOf({ roundsCount: '9' }).length, 5)
})
await test('subject and every detail are in the email; greeting uses the first name', () => {
  const email = buildDriveEmail(drive, { name: 'Riya Verma', course: 'MCA' })
  assert.equal(email.subject, 'Placement Drive — TechNova Solutions | Graduate Trainee | 15 October 2026')
  for (const text of ['Dear Riya,', 'TechNova Solutions', 'Graduate Trainee', '₹4.5 LPA', 'Mohali, Chandigarh', 'Thursday, 15 October 2026', '9:30 AM', 'Seminar Hall, Block B', '1st round: Aptitude test', '2nd round: Technical interview', '3rd round: HR interview', 'BCA, MCA', '60% throughout', 'Work on client web apps.', 'because MCA students are eligible to apply']) {
    assert.ok(email.text.includes(text), `text has ${text}`)
    assert.ok(email.html.includes(text.replace(/&/g, '&amp;')), `html has ${text}`)
  }
  assert.ok(email.html.includes('60% throughout<br>Good communication'), 'line breaks kept in HTML')
  assert.equal(driveEmailSubject(drive, { update: true }).startsWith('Updated: '), true)
  assert.equal(driveDetailRows(drive).length, 11) // incl. mode of drive
})
await test('anything typed into the form is escaped in the HTML email', () => {
  const email = buildDriveEmail({ ...drive, company: '<script>alert(1)</script>', summary: '<img src=x onerror=alert(1)>' }, { name: '"><b>x' })
  assert.ok(!email.html.includes('<script>alert'), 'no script tag'); assert.ok(!email.html.includes('<img src=x'), 'no injected image')
  assert.ok(email.html.includes('&lt;script&gt;'))
})
await test('form checks: everything required, rounds follow the chosen number', () => {
  assert.deepEqual(driveProblems(drive), {})
  const problems = driveProblems({ roundsCount: '2' })
  for (const key of ['company', 'role', 'ctc', 'locations', 'mode', 'driveDate', 'reportingTime', 'venue', 'round1', 'round2', 'eligible', 'requirements', 'summary']) assert.ok(problems[key], `${key} needed`)
  assert.equal(problems.round3, undefined)
  assert.match(driveProblems({ ...drive, eligible: 'xyz' }).eligible, /Tick at least one programme/)
  assert.equal(driveProblems({ ...drive, mode: 'Virtual (online)', venue: '' }).venue, undefined, 'venue optional for virtual drives')
  assert.match(driveProblems({ ...drive, website: 'not a site', minTwelfth: '120' }).website, /web address/)
  assert.match(driveProblems({ ...drive, minTwelfth: '120' }).minTwelfth, /0 to 100/)
})
await test('email progress counts', () => {
  assert.deepEqual(emailCounts([{ status: 'sent' }, { status: 'failed' }, { status: 'queued' }, {}]), { total: 4, sent: 1, failed: 1, queued: 2 })
})

console.log('Mail API')
const fakeReq = (method, url, body, headers = {}) => {
  const listeners = {}
  const req = { method, url, headers: { 'content-type': 'application/json', ...headers }, on: (event, fn) => { listeners[event] = fn; return req }, destroy() {} }
  setTimeout(() => { if (body !== undefined) listeners.data?.(Buffer.from(JSON.stringify(body))); listeners.end?.() })
  return req
}
const call = (api, req) => new Promise((resolve) => {
  const res = { statusCode: 0, setHeader() {}, end: (text) => resolve({ status: res.statusCode, body: JSON.parse(text) }) }
  api.handle(req, res)
})
await test('.env reading: quotes, comments, App Password spaces', () => {
  assert.deepEqual(parseEnv('# c\nSMTP_USER=a@b.com\nSMTP_PASS="abcd efgh ijkl mnop"\nMAIL_FROM_NAME=GJIMT Placement Cell # name\n'), { SMTP_USER: 'a@b.com', SMTP_PASS: 'abcd efgh ijkl mnop', MAIL_FROM_NAME: 'GJIMT Placement Cell' })
})
await test('not set up → status says so and sending is refused (emails stay queued)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-'))
  const api = createMailApi({ envFile: join(dir, '.env'), env: {}, log: {} })
  assert.deepEqual((await call(api, fakeReq('GET', '/api/mail/status'))).body, { ok: true, configured: false, from: '', host: 'smtp.gmail.com' })
  const refused = await call(api, fakeReq('POST', '/api/mail/drive', { drive, recipients: [{ email: 'a@b.com' }] }))
  assert.equal(refused.status, 503); assert.equal(refused.body.code, 'not-configured')
  // adding the settings file is picked up without a restart
  writeFileSync(join(dir, '.env'), 'SMTP_USER=placement@gmail.com\nSMTP_PASS=abcd efgh ijkl mnop\n')
  const status = (await call(api, fakeReq('GET', '/api/mail/status'))).body
  assert.equal(status.configured, true); assert.equal(status.from, 'pl••••••@gmail.com')
  api.close()
})
await test('requests are checked: token, size, drive details', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-'))
  writeFileSync(join(dir, '.env'), 'SMTP_USER=x@gmail.com\nSMTP_PASS=secret\nMAIL_API_TOKEN=tok123\n')
  const api = createMailApi({ envFile: join(dir, '.env'), env: {}, log: {} })
  assert.equal((await call(api, fakeReq('GET', '/api/mail/status'))).status, 401)
  assert.equal((await call(api, fakeReq('GET', '/api/mail/status', undefined, { 'x-mail-token': 'tok123' }))).status, 200)
  const many = Array.from({ length: 51 }, (_, i) => ({ email: `s${i}@x.in` }))
  assert.equal((await call(api, fakeReq('POST', '/api/mail/drive', { drive, recipients: many }, { 'x-mail-token': 'tok123' }))).status, 413)
  assert.equal((await call(api, fakeReq('POST', '/api/mail/drive', { drive: { ...drive, eligible: '' }, recipients: [{ email: 'a@b.in' }] }, { 'x-mail-token': 'tok123' }))).status, 400)
  api.close()
})
await test('SMTP errors become plain English', () => {
  assert.match(friendlySmtpError({ code: 'EAUTH', response: '535 Username and Password not accepted' }), /App Password/)
  assert.match(friendlySmtpError({ code: 'ETIMEDOUT' }), /Could not reach/)
})


console.log('Placement notice details (ICICI-style)')
const icici = {
  ...drive, company: 'ICICI Bank', about: 'India’s Second Largest Private Sector Bank', website: 'www.icici.bank.in',
  registrationLink: 'https://www.icicicareers.com/CareerApplicant/Career/job-details/2271594', applyBy: '2026-10-12',
  role: 'Relationship Manager', specialization: 'Marketing, Finance', vacancies: '20', ctc: 'Rs. 4.08–4.44 LPA (varies by location)',
  mode: 'Company premises', roundsCount: '4', round1: 'Online application', round2: 'Descriptive questionnaire', round3: 'Aptitude test', round4: 'Personal interview',
  eligible: 'MBA', batches: '2025-27', minTenth: '60', minTwelfth: '60', minGraduation: '55', minPG: '6.0 CGPA', backlogs: 'No active backlogs allowed',
  graduationRequired: 'Any graduation (regular)', howToApply: 'Choose “Gian Jyoti Institute of Management and Technology, S.A.S Nagar” in the college list.',
  documents: 'Resume, ID proof', notes: 'Pending academic backlog — do not apply.', contact: 'Placement Cell, 98xxxxxx10', summary: 'Engage with customers of the Bank.\nRotational shifts.',
}
await test('links: web addresses only; "www…" gets https://, javascript: is refused', () => {
  assert.equal(normalizeUrl('www.icici.bank.in'), 'https://www.icici.bank.in/')
  assert.equal(normalizeUrl('javascript:alert(1)'), '')
  assert.equal(normalizeUrl('ftp://x.com'), '')
  assert.equal(normalizeUrl('hello'), '')
  assert.equal(normalizeUrl(''), '')
})
await test('email groups every new detail: job, drive, eligibility, how to apply, JD, notes', () => {
  const titles = driveSections(icici).map((section) => section.title)
  assert.deepEqual(titles, ['Job details', 'Drive details', 'Eligibility', 'How to apply'])
  const email = buildDriveEmail(icici, { name: 'Aman Gill', course: 'MBA' })
  for (const value of ['India’s Second Largest Private Sector Bank', 'https://www.icici.bank.in/', 'Relationship Manager', 'Marketing, Finance', 'Number of vacancies: 20',
    'Company premises', '4th round: Personal interview', 'MBA (batch 2025-27)', 'Class X: 60% and above', 'Graduation: 55% and above', 'MBA / MCA: 6.0 CGPA',
    'No active backlogs allowed', 'Any graduation (regular)', 'Last date to register: Monday, 12 October 2026', 'Gian Jyoti Institute of Management and Technology, S.A.S Nagar',
    'Resume, ID proof', 'Placement Cell, 98xxxxxx10', 'JOB DESCRIPTION (JD)', 'Rotational shifts.', 'IMPORTANT NOTES', 'Pending academic backlog']) {
    assert.ok(email.text.includes(value), `text has ${value}`)
  }
  assert.ok(email.html.includes('href="https://www.icicicareers.com/CareerApplicant/Career/job-details/2271594"') && email.html.includes('Register for this drive'), 'register button links to the registration page')
  assert.ok(!buildDriveEmail({ ...icici, registrationLink: 'javascript:alert(1)' }).html.includes('javascript:'), 'no unsafe links')
  assert.ok(DRIVE_EMAIL_FIELDS.includes('registrationLink') && DRIVE_EMAIL_FIELDS.includes('round5'), 'server accepts the new fields')
})
await test('marks criteria leave out students below the minimum; missing marks still emailed', () => {
  const mba = [
    { name: 'A', course: 'MBA', email: 'a@x.in', placementStatus: 'Eligible', tenthPercent: '72', twelfthPercent: '68', graduationPercent: '61' },
    { name: 'B', course: 'MBA', email: 'b@x.in', placementStatus: 'Eligible', tenthPercent: '58', twelfthPercent: '70', graduationPercent: '65' },
    { name: 'C', course: 'MBA', email: 'c@x.in', placementStatus: 'Eligible', tenthPercent: '80', twelfthPercent: '75', graduationPercent: '' },
  ]
  const result = selectRecipients(mba, { courses: 'MBA', minMarks: { minTenth: '60', minTwelfth: '60', minGraduation: '55' } })
  assert.deepEqual(result.recipients.map((r) => r.name), ['A', 'C'])
  assert.equal(result.skipped.belowMarks, 1); assert.equal(result.marksUnknown, 1)
  assert.equal(selectRecipients(mba, { courses: 'MBA', minMarks: { minTenth: '60' }, applyMarks: false }).recipients.length, 3, 'switch off → everyone')
})
await test('specialization: optional filter matches free-text specializations', () => {
  assert.ok(matchesSpecialization('Full Stack (MERN)', 'Software Development'))
  assert.ok(matchesSpecialization('Data Anlayst / Digital Marketing', 'Digital Marketing'))
  assert.ok(matchesSpecialization('Human Resource', 'HR')); assert.ok(matchesSpecialization('Marketing & HR', 'Finance, HR'))
  assert.ok(!matchesSpecialization('Finance', 'Marketing')); assert.ok(!matchesSpecialization('', 'Marketing')); assert.ok(!matchesSpecialization('None', 'Marketing'))
  assert.ok(!matchesSpecialization('Digital Marketing', 'IT / Systems'), '"it" must be a whole word')
  assert.ok(matchesSpecialization('anything', 'Any specialization')); assert.ok(matchesSpecialization('Finance', ''))
  const list = [{ course: 'MBA', email: 'm@x.in', specialization: 'Marketing' }, { course: 'MBA', email: 'f@x.in', specialization: 'Finance' }, { course: 'MBA', email: 'n@x.in', specialization: '' }]
  assert.equal(selectRecipients(list, { courses: 'MBA', specializations: 'Marketing' }).recipients.length, 3, 'off by default')
  const on = selectRecipients(list, { courses: 'MBA', specializations: 'Marketing', matchSpecialization: true })
  assert.deepEqual(on.recipients.map((r) => r.email), ['m@x.in']); assert.equal(on.skipped.specialization, 2)
})
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
