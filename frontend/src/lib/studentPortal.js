/* =========================================================
   Student portal — reading and saving (rules live in studentRules.js).
   Collections:
     students         Master Data (a student's own record, found by email)
     applications     one per student per drive  (id = driveId__email)
     attendance       sessions (no codes inside — students can read these)
     attendanceCodes  the check-in code per session (Placement Cell only)
     attendanceMarks  one per student per session (id = sessionId__email)
   Every email goes through the outbox (notify.js).
========================================================= */
import { addRecord, deleteRecord, getRecord, listRecords, queryRecords, setRecord, updateRecord } from './dataStore'
import { isFirebaseConfigured } from './firebase'
import { queueEmails } from './notify'
import {
  APPLICATIONS, ATTENDANCE, ATTENDANCE_CODES, ATTENDANCE_MARKS, IDENTITY_FIELDS,
  applicantSnapshot, applicationId, canWithdraw, cleanCode, cleanRegistration, codeMatches, driveEligibility,
  findStudentByEmail, makeCode, markId, normEmail, registrationFields, sessionAudience, statusFromInterest,
} from './studentRules'

const STUDENTS = 'students'
const nowISO = () => new Date().toISOString()
const person = (record = {}, user = {}) => ({ name: record.name || user.displayName || '', email: normEmail(record.email || user.email) })

/* ---------- Master Data record ---------- */

/** The student's own Master Data record (same email), or null when they still have to register. */
export async function loadStudentRecord(email) {
  const key = normEmail(email)
  if (!key) return null
  if (!isFirebaseConfigured) return findStudentByEmail(await listRecords(STUDENTS), key)
  return (await queryRecords(STUDENTS, 'email', key))[0] || null
}

/** Records used to spot a roll number that already belongs to someone else (only readable without Firebase). */
export const studentsForChecks = async () => (isFirebaseConfigured ? [] : listRecords(STUDENTS))

/** Right after a student account is created: welcome email; returns their Master Data record (or null). */
export async function afterStudentSignUp(user) {
  const record = await loadStudentRecord(user.email)
  await queueEmails('welcome', { linked: record ? 'Yes' : 'No', rollNo: record?.rollNo, course: record?.course, batch: record?.batch }, [person(record || {}, user)], { by: user.uid, ref: 'sign-up' })
  return record
}

/**
 * Saves the registration form.
 * - existing record: updates everything except the identity fields and staff fields
 * - no record yet: adds the student to Master Data, emails them a receipt and alerts the Placement Cell
 */
export async function saveRegistration(user, values, existing = null) {
  const clean = cleanRegistration({ ...values, email: user.email })
  if (existing) {
    const changes = {}
    registrationFields(clean).forEach((field) => { if (!IDENTITY_FIELDS.includes(field.key)) changes[field.key] = clean[field.key] })
    changes.placementStatus = statusFromInterest(existing.placementStatus, clean.placementInterest)
    changes.updatedAt = nowISO()
    changes.updatedBy = 'Student (portal)'
    const updated = await updateRecord(STUDENTS, existing.id, changes)
    return { record: { ...existing, ...updated }, created: false }
  }
  const record = await addRecord(STUDENTS, {
    ...clean,
    email: normEmail(user.email),
    placementStatus: statusFromInterest('', clean.placementInterest),
    company: '',
    source: 'Student sign-up',
    registeredAt: nowISO(),
    accountUid: user.uid || '',
  })
  await queueEmails('registrationSaved', record, [person(record, user)], { by: user.uid, ref: record.id })
  await queueEmails('newStudentAlert', { studentName: record.name, studentEmail: record.email, rollNo: record.rollNo, course: record.course, batch: record.batch, phone: record.phone }, [], { by: user.uid, ref: record.id })
  return { record, created: true }
}

/* ---------- Applications ---------- */

export async function listMyApplications(email) {
  const key = normEmail(email)
  if (!isFirebaseConfigured) return (await listRecords(APPLICATIONS)).filter((item) => normEmail(item.studentEmail) === key)
  return queryRecords(APPLICATIONS, 'studentEmail', key)
}

export const listDriveApplications = (driveId) => queryRecords(APPLICATIONS, 'driveId', driveId)
export const listAllApplications = () => listRecords(APPLICATIONS)

export async function applyForDrive(user, student, drive) {
  const check = driveEligibility(drive, student)
  if (!check.canApply) throw new Error(check.closedReason || check.reasons[0] || 'You cannot apply for this drive.')
  const id = applicationId(drive.id, student.email)
  const existing = await getRecord(APPLICATIONS, id)
  if (existing && existing.status !== 'Withdrawn') throw new Error('You have already applied for this drive.')
  const at = nowISO()
  const application = await setRecord(APPLICATIONS, id, {
    driveId: drive.id, company: drive.company || '', role: drive.role || '', driveDate: drive.driveDate || '',
    ...applicantSnapshot(student),
    status: 'Applied', note: '', roundsCleared: '',
    history: [...(existing?.history || []), { status: 'Applied', at, by: 'Student' }],
    appliedAt: at,
  }, { merge: false, strict: true })
  await queueEmails('applicationReceived', drive, [person(student, user)], { by: user.uid, ref: id })
  return application
}

export async function withdrawApplication(application) {
  if (!canWithdraw(application)) throw new Error('Only applications still marked “Applied” can be withdrawn.')
  const at = nowISO()
  return setRecord(APPLICATIONS, application.id, { status: 'Withdrawn', history: [...(application.history || []), { status: 'Withdrawn', at, by: 'Student' }] }, { strict: true })
}

/**
 * Placement Cell: change status / rounds cleared / note. Selected → the student becomes "Placed" in Master Data.
 * notify: email the student about the change.
 */
export async function setApplicationStatus(application, { status, note, roundsCleared }, { by = 'Placement Cell', notify = true, drive = null } = {}) {
  const changes = {}
  if (status !== undefined && status !== application.status) changes.status = status
  if (note !== undefined && note !== (application.note || '')) changes.note = note
  if (roundsCleared !== undefined && String(roundsCleared) !== String(application.roundsCleared || '')) changes.roundsCleared = String(roundsCleared)
  if (!Object.keys(changes).length) return application
  const at = nowISO()
  changes.history = [...(application.history || []), { status: changes.status || application.status, at, by, ...(changes.note ? { note: changes.note } : {}), ...(changes.roundsCleared ? { roundsCleared: changes.roundsCleared } : {}) }]
  changes.statusAt = at
  const updated = { ...application, ...(await updateRecord(APPLICATIONS, application.id, changes)) }

  if (changes.status === 'Selected') {
    const student = application.studentId ? await getRecord(STUDENTS, application.studentId) : await loadStudentRecord(application.studentEmail)
    if (student) {
      const companies = String(student.company || '').split(',').map((item) => item.trim()).filter(Boolean)
      if (!companies.some((item) => item.toLowerCase() === String(application.company).toLowerCase())) companies.push(application.company)
      await updateRecord(STUDENTS, student.id, { placementStatus: 'Placed', company: companies.join(', '), placedAt: at })
    }
  }
  if (notify && (changes.status || changes.note || changes.roundsCleared)) {
    const roundsTotal = drive?.roundsCount || ''
    await queueEmails('applicationStatus', { company: updated.company, role: updated.role, status: updated.status, roundsCleared: updated.roundsCleared, roundsTotal, note: updated.note, driveDate: updated.driveDate }, [{ name: updated.name, email: updated.studentEmail }], { by, ref: application.id })
  }
  return updated
}

/* ---------- Attendance ---------- */

export const listSessions = () => listRecords(ATTENDANCE)
export const getSession = (id) => getRecord(ATTENDANCE, id)
export const getSessionCode = async (id) => (await getRecord(ATTENDANCE_CODES, id))?.code || ''
export const listSessionMarks = (sessionId) => queryRecords(ATTENDANCE_MARKS, 'sessionId', sessionId)

export async function listMyMarks(email) {
  const key = normEmail(email)
  if (!isFirebaseConfigured) return (await listRecords(ATTENDANCE_MARKS)).filter((mark) => normEmail(mark.studentEmail) === key)
  return queryRecords(ATTENDANCE_MARKS, 'studentEmail', key)
}

/** New session + its check-in code. announce: email every expected student. */
export async function createSession(values, { by = '', announce = false, students = [], applications = [] } = {}) {
  const session = await addRecord(ATTENDANCE, { ...values, checkIn: 'Not started', createdBy: by })
  const code = makeCode()
  await setRecord(ATTENDANCE_CODES, session.id, { code, sessionId: session.id })
  let announced = 0
  if (announce) {
    const audience = sessionAudience(session, students, applications)
    await queueEmails('attendanceSession', { title: session.title, kind: session.kind, date: session.date, time: session.time, venue: session.venue, company: session.company }, audience.map((student) => ({ name: student.name, email: student.email })), { by, ref: session.id })
    announced = audience.length
  }
  return { session, code, announced }
}

export const updateSession = (id, changes) => updateRecord(ATTENDANCE, id, changes)

export async function newSessionCode(id) {
  const code = makeCode()
  await setRecord(ATTENDANCE_CODES, id, { code, sessionId: id })
  return code
}

/** Open / close check-in. */
export const setCheckIn = (id, state) => updateRecord(ATTENDANCE, id, { checkIn: state, ...(state === 'Open' ? { openedAt: nowISO() } : { closedAt: nowISO() }) })

export async function deleteSession(id, marks = []) {
  for (const mark of marks) await deleteRecord(ATTENDANCE_MARKS, mark.id)
  await deleteRecord(ATTENDANCE_CODES, id).catch(() => {})
  await deleteRecord(ATTENDANCE, id)
}

const markFields = (session, student) => ({
  sessionId: session.id, sessionTitle: session.title || '', sessionDate: session.date || '',
  studentEmail: normEmail(student.email), studentId: student.id || student.studentId || '',
  name: student.name || '', rollNo: student.rollNo || '', course: student.course || '', batch: student.batch || '',
})

/** Placement Cell marks a student Present / Late / Absent. */
export const markStudent = (session, student, status, by = 'Placement Cell') =>
  setRecord(ATTENDANCE_MARKS, markId(session.id, student.email), { ...markFields(session, student), status, method: 'Marked by Placement Cell', by, at: nowISO() })

/** Student checks in with the code shown at the venue. */
export async function checkInWithCode(student, session, code) {
  if (session.checkIn !== 'Open') throw new Error('Check-in is not open for this session.')
  const given = cleanCode(code)
  if (given.length !== 6) throw new Error('Enter the 6-character code shown by the Placement Cell.')
  if (!isFirebaseConfigured && !codeMatches(given, await getSessionCode(session.id))) throw new Error('That code is not right. Check it with the Placement Cell.')
  const existing = await getRecord(ATTENDANCE_MARKS, markId(session.id, student.email)).catch(() => null)
  if (existing && existing.status !== 'Absent') return existing
  return setRecord(ATTENDANCE_MARKS, markId(session.id, student.email), { ...markFields(session, student), status: 'Present', method: 'Code', code: given, by: 'Student', at: nowISO() }, { merge: false, strict: true })
}
