/* =========================================================
   Student portal rules — pure functions (no storage), shared by
   the pages and the tests.
   - which Master Data record belongs to a student (by email)
   - the registration form: which fields, which are required, checks
   - who may apply for a drive, and why not
   - attendance: audience, check-in codes, summaries
========================================================= */
import { entityConfigs } from '../config/modules.js'
import { DEFAULT_LEAVE_OUT, formatDriveDate, parseCourses, recipientOptions, selectRecipients, splitList } from './driveEmail.js'

const studentConfig = entityConfigs.students
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const keyOf = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (value) => String(value ?? '').trim()
const todayLocal = () => new Date().toLocaleDateString('en-CA')

export const normEmail = (value) => String(value ?? '').trim().toLowerCase()

/** "aman.gill@gmail.com" → "am••••@gmail.com" (shown when an email must not be revealed in full). */
export const maskEmail = (email) => {
  const [user, domain] = normEmail(email).split('@')
  if (!domain) return ''
  return `${user.slice(0, 2)}${'•'.repeat(Math.min(6, Math.max(2, user.length - 2)))}@${domain}`
}

/* ---------- Which record is this student? ---------- */

/** The Master Data record with this email (same email = same student). */
export function findStudentByEmail(students = [], email) {
  const key = normEmail(email)
  if (!key) return null
  return students.find((student) => normEmail(student?.email) === key) || null
}

/* ---------- Registration form ---------- */

/** Set by the Placement Cell / Admin only. */
export const STAFF_FIELDS = ['placementStatus', 'company']
/** Fixed once the record exists — the Placement Cell corrects these if needed. */
export const IDENTITY_FIELDS = ['name', 'rollNo', 'course', 'batch', 'email']
/** "Full details" asked from every student who registers. */
export const REGISTRATION_REQUIRED = ['name', 'rollNo', 'course', 'batch', 'email', 'phone', 'fatherName', 'address', 'state', 'tenthPercent', 'twelfthPercent', 'placementInterest']
const PG_COURSES = ['MCA', 'MBA']
const PG_REQUIRED = ['graduationDone', 'graduationDegree', 'graduationPercent']

/** The Master Data form as a student sees it: no staff fields, required flags for registration. */
export function registrationFields(values = {}) {
  const pg = PG_COURSES.includes(values.course)
  return studentConfig.fields
    .filter((field) => !STAFF_FIELDS.includes(field.key))
    .map((field) => ({ ...field, required: REGISTRATION_REQUIRED.includes(field.key) || (pg && PG_REQUIRED.includes(field.key)) }))
}

export const registrationConfig = (values = {}) => ({ ...studentConfig, fields: registrationFields(values) })

const percentProblem = (value, max = 100) => {
  if (!text(value)) return ''
  const number = Number(String(value).replace('%', ''))
  return Number.isFinite(number) && number >= 0 && number <= max ? '' : `Enter a number from 0 to ${max}.`
}
const phoneDigits = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

/** Trimmed copy of the form, email in lower case, phones as 10 digits. */
export function cleanRegistration(values = {}) {
  const clean = {}
  registrationFields(values).forEach((field) => {
    let value = text(values[field.key]).replace(/\s+/g, ' ')
    if (field.key === 'email') value = normEmail(value)
    if (field.format === 'phone' && value) value = phoneDigits(value) || value
    if (field.type === 'percent' && value) value = value.replace('%', '').trim()
    clean[field.key] = value
  })
  return clean
}

/**
 * Problems with the form → { fieldKey: message }. Empty object = OK.
 * students: all Master Data records (to catch a roll number that belongs to someone else); selfId: this student's record id.
 */
export function registrationProblems(values = {}, { students = [], selfId = null } = {}) {
  const problems = {}
  const clean = cleanRegistration(values)
  registrationFields(values).forEach((field) => {
    const value = clean[field.key]
    if (field.required && !value) { problems[field.key] = `${field.label.replace(/ \(optional\)$/, '')} is required.`; return }
    if (!value) return
    if (field.type === 'select' && !field.options.includes(value)) problems[field.key] = `Choose one of: ${field.options.join(', ')}.`
    if (field.type === 'email' && !EMAIL.test(value)) problems[field.key] = 'Enter a valid email address.'
    if (field.format === 'phone' && !/^\d{10}$/.test(value)) problems[field.key] = 'Enter a 10-digit mobile number.'
    if (field.type === 'percent') { const issue = percentProblem(value); if (issue) problems[field.key] = issue }
    if (field.key === 'cgpa') { const issue = percentProblem(value, 10); if (issue) problems[field.key] = issue }
  })
  if (clean.rollNo && !problems.rollNo) {
    const other = students.find((student) => student?.id !== selfId && keyOf(student?.rollNo) === keyOf(clean.rollNo))
    if (other && normEmail(other.email) !== clean.email) {
      problems.rollNo = `This roll number is already in Master Data with another email (${maskEmail(other.email) || 'no email'}). Sign up with that email, or ask the Placement Cell to correct it.`
    }
  }
  return problems
}

/** Placement status that follows the student's "Interested" answer (never overrides Placed / Not Eligible). */
export function statusFromInterest(currentStatus, interest) {
  if (interest === 'No' && ['', 'Eligible', 'In Process', undefined].includes(currentStatus)) return 'Opted Out'
  if (interest === 'Yes' && (currentStatus === 'Opted Out' || !currentStatus)) return 'Eligible'
  return currentStatus || 'Eligible'
}

/** Registration % — how much of the form is filled (for the portal's progress ring). */
export function registrationProgress(record = {}) {
  const fields = registrationFields(record)
  const filled = fields.filter((field) => text(record[field.key])).length
  return Math.round((filled / fields.length) * 100)
}

/* ---------- Applying for drives ---------- */

export const APPLICATIONS = 'applications'
export const APPLICATION_STATUSES = ['Applied', 'Shortlisted', 'Selected', 'Not selected', 'Withdrawn']
export const CLOSED_DRIVE_STATUSES = ['Closed', 'Completed', 'Cancelled']
const emailKey = (email) => normEmail(email).replace(/[^a-z0-9]/g, '_')

/** One application per student per drive. */
export const applicationId = (driveId, email) => `${driveId}__${emailKey(email)}`

const STATUS_REASON = {
  'Opted Out': 'You have opted out of placements. Change “Interested” to Yes in Registration to take part.',
  'Not Eligible': 'Your placement status is “Not Eligible”. Please contact the Placement Cell.',
  Placed: 'You are already placed, and this drive is not open to placed students.',
}

const MARKS = [['minTenth', 'tenthPercent', 'Class X'], ['minTwelfth', 'twelfthPercent', 'Class XII'], ['minGraduation', 'graduationPercent', 'Graduation']]
const percentOf = (value) => { const n = parseFloat(String(value ?? '').replace('%', '')); return Number.isFinite(n) ? n : null }

/**
 * May this student apply? → { eligible, canApply, reasons[], closedReason, marksUnknown }
 * Uses exactly the same rules as the drive email (courses, batch, status, marks, specialization).
 */
export function driveEligibility(drive = {}, student = {}, today = todayLocal()) {
  const options = recipientOptions(drive)
  const probe = { ...student, email: EMAIL.test(normEmail(student.email)) ? normEmail(student.email) : 'student@portal.local' }
  const { recipients, skipped, inCourses, marksUnknown } = selectRecipients([probe], options)
  const reasons = []
  const courses = parseCourses(drive.eligible)
  if (!inCourses) reasons.push(`This drive is for ${courses.length ? courses.join(', ') : 'other'} students.`)
  if (skipped.otherBatch) reasons.push(`This drive is for batch ${splitList(drive.batches).join(', ')}.`)
  Object.keys(skipped.byStatus).forEach((status) => reasons.push(STATUS_REASON[status] || `Your placement status (${status}) is not open for this drive.`))
  if (skipped.belowMarks) {
    MARKS.forEach(([minKey, studentKey, label]) => {
      const need = percentOf(drive[minKey]); const have = percentOf(student[studentKey])
      if (need && have !== null && have < need) reasons.push(`Minimum ${label} ${need}% — yours is ${have}%.`)
    })
  }
  if (skipped.specialization) reasons.push(`This drive is for ${splitList(drive.specialization).join(', ')} specialization.`)

  let closedReason = ''
  if (CLOSED_DRIVE_STATUSES.includes(drive.status)) closedReason = `This drive is ${String(drive.status).toLowerCase()}.`
  else if (drive.driveDate && String(drive.driveDate) < today) closedReason = 'This drive has already taken place.'
  else if (drive.applyBy && String(drive.applyBy) < today) closedReason = `The last date to apply (${formatDriveDate(drive.applyBy, { weekday: false })}) has passed.`

  const eligible = recipients.length === 1
  return { eligible, canApply: eligible && !closedReason, reasons, closedReason, marksUnknown: eligible && marksUnknown > 0 }
}

export const leaveOutFor = (drive = {}) => (drive.leaveOut !== undefined ? splitList(drive.leaveOut) : DEFAULT_LEAVE_OUT)
export const canWithdraw = (application) => application?.status === 'Applied'
export const isActiveApplication = (application) => Boolean(application) && application.status !== 'Withdrawn'

/** Snapshot of the student kept on the application (what the Placement Cell exports for the company). */
export const applicantSnapshot = (student = {}) => ({
  studentId: student.id || '',
  studentEmail: normEmail(student.email),
  name: text(student.name),
  rollNo: text(student.rollNo),
  course: text(student.course),
  batch: text(student.batch),
  phone: text(student.phone),
  specialization: text(student.specialization),
  tenthPercent: text(student.tenthPercent),
  twelfthPercent: text(student.twelfthPercent),
  graduationPercent: text(student.graduationPercent),
  cgpa: text(student.cgpa),
  selfRegistered: student.source === 'Student sign-up' ? 'Yes' : 'No',
})

/* ---------- Attendance ---------- */

export const ATTENDANCE = 'attendance'
export const ATTENDANCE_CODES = 'attendanceCodes'
export const ATTENDANCE_MARKS = 'attendanceMarks'
export const SESSION_KINDS = ['Placement drive', 'Pre-placement talk', 'Aptitude test', 'Training', 'Mock interview', 'Workshop', 'Other']
export const MARK_STATUSES = ['Present', 'Late', 'Absent']
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L

export function makeCode(random = Math.random) {
  return Array.from({ length: 6 }, () => CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)]).join('')
}
export const cleanCode = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const codeMatches = (given, expected) => Boolean(expected) && cleanCode(given) === cleanCode(expected)

export const markId = (sessionId, email) => `${sessionId}__${emailKey(email)}`

/** Is this student expected at the session? Courses/batch, or (audience "applicants") applied to the linked drive. */
export function inAudience(session = {}, student = {}, applications = []) {
  if (session.audience === 'applicants' && session.driveId) {
    return applications.some((application) => application.driveId === session.driveId && normEmail(application.studentEmail) === normEmail(student.email) && isActiveApplication(application) && application.status !== 'Not selected')
  }
  const courses = parseCourses(session.courses).map(keyOf)
  if (courses.length && !courses.includes(keyOf(student.course))) return false
  const batches = splitList(session.batches).map(keyOf).filter(Boolean)
  if (batches.length && !batches.includes(keyOf(student.batch))) return false
  return student.placementStatus !== 'Opted Out' || session.includeOptedOut === 'Yes'
}

/** Students expected at a session (staff view), sorted by course then name. */
export function sessionAudience(session = {}, students = [], applications = []) {
  return students
    .filter((student) => inAudience(session, student, applications))
    .sort((a, b) => String(a.course).localeCompare(String(b.course)) || String(a.name).localeCompare(String(b.name)))
}

/** Counts for a session: { expected, present, late, absent, unmarked }. */
export function sessionCounts(audience = [], marks = []) {
  const byEmail = new Map(marks.map((mark) => [normEmail(mark.studentEmail), mark]))
  const counts = { expected: audience.length, present: 0, late: 0, absent: 0, unmarked: 0 }
  audience.forEach((student) => {
    const status = byEmail.get(normEmail(student.email))?.status
    if (status === 'Present') counts.present += 1
    else if (status === 'Late') counts.late += 1
    else if (status === 'Absent') counts.absent += 1
    else counts.unmarked += 1
  })
  return counts
}

/**
 * A student's attendance: one row per session meant for them, newest first, plus the percentage.
 * Row status: Present / Late / Absent / Not marked (past, never marked) / Open now / Upcoming.
 */
export function studentAttendance(sessions = [], marks = [], student = {}, applications = [], today = todayLocal()) {
  const mine = new Map(marks.filter((mark) => normEmail(mark.studentEmail) === normEmail(student.email)).map((mark) => [mark.sessionId, mark]))
  const rows = sessions
    .filter((session) => inAudience(session, student, applications) || mine.has(session.id))
    .map((session) => {
      const mark = mine.get(session.id)
      let status = mark?.status
      if (!status) status = session.checkIn === 'Open' ? 'Open now' : String(session.date) > today ? 'Upcoming' : session.checkIn === 'Closed' ? 'Absent' : 'Not marked'
      return { session, mark, status }
    })
    .sort((a, b) => String(b.session.date).localeCompare(String(a.session.date)) || String(b.session.time || '').localeCompare(String(a.session.time || '')))
  const counted = rows.filter((row) => ['Present', 'Late', 'Absent'].includes(row.status))
  const attended = counted.filter((row) => row.status !== 'Absent').length
  return { rows, attended, total: counted.length, percent: counted.length ? Math.round((attended / counted.length) * 100) : null }
}
