/* =========================================================
   Placement drive emails — shared by the app and the mail server.
   Pure functions only (no browser or Node APIs), so the email the
   Placement Cell previews is exactly the email students receive.

   selectRecipients()  which students get the email
   driveSections()     every detail, grouped (email + drive page)
   buildDriveEmail()   subject + plain text + HTML for one student
   driveProblems()     what is missing before a drive can be saved

   Fields follow the details companies send in placement notices
   (e.g. ICICI Bank's MBA 2025-27 notice): website, registration link,
   specialization, vacancies, mode, marks criteria, backlogs, process…
========================================================= */

export const DRIVE_COURSES = ['BBA', 'BCA', 'B.Com', 'MCA', 'MBA']

export const DRIVE_MODES = ['On campus', 'Off campus', 'Company premises', 'Virtual (online)', 'Hybrid']

/** Chips offered for "Specialization"; words help match the students' free-text specialization. */
export const SPECIALIZATIONS = [
  { label: 'Any specialization', words: [] },
  { label: 'Marketing', words: ['marketing', 'sales'] },
  { label: 'Finance', words: ['finance', 'banking', 'accounts', 'accounting', 'fintech'] },
  { label: 'HR', words: ['hr', 'human resource', 'human resources'] },
  { label: 'Operations', words: ['operations', 'supply chain', 'logistics'] },
  { label: 'Business Analytics', words: ['business analytics', 'analytics'] },
  { label: 'International Business', words: ['international business', 'ib'] },
  { label: 'IT / Systems', words: ['it', 'systems', 'information technology'] },
  { label: 'Software Development', words: ['full stack', 'fullstack', 'mern', 'software', 'web development', 'developer', 'development'] },
  { label: 'Data Science & Analytics', words: ['data science', 'data analyst', 'data anlayst', 'data analysis', 'data analytics', 'analytics'] },
  { label: 'AI & ML', words: ['ai', 'ml', 'machine learning', 'artificial intelligence'] },
  { label: 'Cyber Security', words: ['cyber', 'security'] },
  { label: 'Cloud Computing', words: ['cloud'] },
  { label: 'Digital Marketing', words: ['digital marketing'] },
]

/** Quick picks for the selection process. */
export const PROCESS_STEPS = [
  'Online application', 'Pre-placement talk (PPT)', 'Descriptive questionnaire', 'Aptitude test', 'Online assessment',
  'Coding test', 'Group discussion (GD)', 'Technical interview', 'HR interview', 'Personal interview', 'Case study',
]

export const BACKLOG_OPTIONS = ['No active backlogs allowed', 'Active backlogs allowed', 'Up to 1 active backlog', 'Up to 2 active backlogs']

export const MAX_ROUNDS = 5
export const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

/** Every field a drive email may use — the mail server accepts only these. */
export const DRIVE_EMAIL_FIELDS = [
  'company', 'website', 'about', 'registrationLink', 'applyBy', 'jdLink',
  'role', 'summary', 'specialization', 'vacancies', 'locations', 'ctc', 'bond',
  'mode', 'driveDate', 'reportingTime', 'venue',
  'roundsCount', 'round1', 'round2', 'round3', 'round4', 'round5',
  'eligible', 'batches', 'minTenth', 'minTwelfth', 'minGraduation', 'minPG', 'graduationRequired', 'backlogs', 'requirements',
  'howToApply', 'documents', 'notes', 'contact',
]

/** Placement statuses that can be left out of a drive email (first two are left out by default). */
export const LEAVE_OUT_OPTIONS = [
  { status: 'Opted Out', label: 'Opted out of placements', byDefault: true },
  { status: 'Not Eligible', label: 'Not eligible', byDefault: true },
  { status: 'Placed', label: 'Already placed', byDefault: false },
]
export const DEFAULT_LEAVE_OUT = LEAVE_OUT_OPTIONS.filter((option) => option.byDefault).map((option) => option.status)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const keyOf = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (value) => String(value ?? '').trim()

/** "BCA, MCA" / ["BCA","MCA"] → ['BCA','MCA'] (trimmed, no blanks). */
export const splitList = (value) => (Array.isArray(value) ? value : String(value ?? '').split(/[,;|\n]+/))
  .map((item) => String(item).trim())
  .filter(Boolean)
export const joinList = (items) => splitList(items).join(', ')

/** Any spelling of the courses ("bcom", "B.Com.", "mca") → the standard names, in standard order. */
export function parseCourses(value) {
  const wanted = new Set(splitList(value).map(keyOf))
  return DRIVE_COURSES.filter((course) => wanted.has(keyOf(course)))
}
const courseName = (value) => DRIVE_COURSES.find((course) => keyOf(course) === keyOf(value)) || String(value ?? '').trim()

/* ---------- Links ---------- */

/** "www.icici.bank.in" → "https://www.icici.bank.in"; anything that isn't a web address → ''. */
export function normalizeUrl(value) {
  let url = text(value)
  if (!url) return ''
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url.replace(/^\/+/, '')}`
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return ''
    return parsed.href
  } catch { return '' }
}
/** Only http(s) links are ever turned into clickable links. */
export const safeUrl = (value) => normalizeUrl(value)

/* ---------- Who receives the email ---------- */

const percent = (value) => {
  const number = parseFloat(String(value ?? '').replace('%', ''))
  return Number.isFinite(number) ? number : null
}

const MARK_FIELDS = [
  { min: 'minTenth', student: 'tenthPercent', label: 'Class X' },
  { min: 'minTwelfth', student: 'twelfthPercent', label: 'Class XII' },
  { min: 'minGraduation', student: 'graduationPercent', label: 'Graduation' },
]

const wordsFor = (specialization) => {
  const known = SPECIALIZATIONS.find((item) => keyOf(item.label) === keyOf(specialization))
  return known ? known.words : [String(specialization).toLowerCase().trim()]
}
const hasWord = (haystack, word) => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack)
}

/** true when the student's (free-text) specialization fits any of the drive's specializations. */
export function matchesSpecialization(studentSpecialization, driveSpecializations) {
  const wanted = splitList(driveSpecializations)
  if (!wanted.length || wanted.some((item) => keyOf(item) === keyOf('Any specialization'))) return true
  const own = String(studentSpecialization ?? '').toLowerCase()
  if (!own.trim() || keyOf(own) === 'none') return false
  return wanted.some((item) => wordsFor(item).some((word) => word && hasWord(own, word)))
}

/**
 * Students who should receive the email.
 * - only ticked courses (and batches, if chosen)
 * - leaves out chosen placement statuses, invalid/repeated emails
 * - applyMarks: leaves out students whose recorded marks are below the minimums
 *   (students with no marks on record are still emailed)
 * - matchSpecialization: only students whose specialization fits
 */
export function selectRecipients(students = [], {
  courses = [], leaveOut = DEFAULT_LEAVE_OUT, batches = [],
  minMarks = {}, applyMarks = true, specializations = [], matchSpecialization = false,
} = {}) {
  const wanted = new Set(parseCourses(courses).map(keyOf))
  const leave = new Set(splitList(leaveOut))
  const batchKeys = new Set(splitList(batches).map(keyOf))
  const minimums = MARK_FIELDS.map((field) => ({ ...field, value: percent(minMarks[field.min]) })).filter((field) => field.value !== null && field.value > 0)
  const seen = new Set()
  const recipients = []
  const byCourse = {}
  const skipped = { byStatus: {}, noEmail: 0, duplicate: 0, otherBatch: 0, belowMarks: 0, specialization: 0 }
  let inCourses = 0
  let marksUnknown = 0

  students.forEach((student) => {
    if (!wanted.has(keyOf(student?.course))) return
    inCourses += 1
    if (batchKeys.size && !batchKeys.has(keyOf(student?.batch))) { skipped.otherBatch += 1; return }
    const status = student?.placementStatus || ''
    if (leave.has(status)) { skipped.byStatus[status] = (skipped.byStatus[status] || 0) + 1; return }
    if (applyMarks && minimums.length) {
      const marks = minimums.map((field) => ({ ...field, has: percent(student?.[field.student]) }))
      if (marks.some((field) => field.has !== null && field.has < field.value)) { skipped.belowMarks += 1; return }
      if (marks.some((field) => field.has === null)) marksUnknown += 1
    }
    if (matchSpecialization && !matchesSpecialization(student?.specialization, specializations)) { skipped.specialization += 1; return }
    const email = String(student?.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) { skipped.noEmail += 1; return }
    if (seen.has(email)) { skipped.duplicate += 1; return }
    seen.add(email)
    const course = courseName(student.course)
    byCourse[course] = (byCourse[course] || 0) + 1
    recipients.push({ name: String(student?.name ?? '').trim(), email, course, batch: student?.batch || '', rollNo: student?.rollNo || '' })
  })

  return { recipients, byCourse, skipped, inCourses, marksUnknown }
}

/** Who-gets-the-email options stored on a drive (also decides which students may apply in the student portal). */
export function recipientOptions(drive = {}) {
  return {
    courses: drive.eligible,
    leaveOut: drive.leaveOut !== undefined ? drive.leaveOut : undefined,
    batches: drive.batches,
    minMarks: { minTenth: drive.minTenth, minTwelfth: drive.minTwelfth, minGraduation: drive.minGraduation },
    applyMarks: drive.applyMarks !== 'No',
    specializations: drive.specialization,
    matchSpecialization: drive.matchSpecialization === 'Yes',
  }
}

/* ---------- Formatting ---------- */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-10-15' → 'Thursday, 15 October 2026' — built by hand so the browser preview and the mail server always match. */
export function formatDriveDate(value, { weekday = true } = {}) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return String(value ?? '')
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return String(value)
  const dayText = `${day} ${MONTHS[month - 1]} ${year}`
  return weekday ? `${WEEKDAYS[date.getUTCDay()]}, ${dayText}` : dayText
}

/** '09:30' → '9:30 AM', '14:05' → '2:05 PM'. Anything else is shown as typed. */
export function formatTime(value) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return String(value ?? '')
  const hours = Number(match[1])
  if (hours > 23) return String(value)
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`
}

export function roundsOf(drive = {}) {
  const count = Math.max(1, Math.min(MAX_ROUNDS, Number(drive.roundsCount) || 1))
  return Array.from({ length: count }, (_, index) => text(drive[`round${index + 1}`]) || `Round ${index + 1}`)
}

export const isVirtual = (mode) => /virtual|online/i.test(String(mode ?? ''))
export const venueLabel = (mode) => (isVirtual(mode) ? 'Meeting link / platform' : 'Venue')

const minText = (value) => {
  const raw = text(value)
  if (!raw) return ''
  return /^\d+(\.\d+)?$/.test(raw) ? `${raw}% and above` : raw
}

/**
 * Every detail, grouped. Rows are [label, value, kind] where kind 'link' means a web address.
 * Empty rows and empty sections are dropped.
 */
export function driveSections(drive = {}) {
  const rounds = roundsOf(drive)
  const courses = parseCourses(drive.eligible).join(', ') || text(drive.eligible)
  const batches = joinList(drive.batches)
  const sections = [
    { key: 'job', title: 'Job details', rows: [
      ['Company', drive.company],
      ['Website', safeUrl(drive.website), 'link'],
      ['Job role / profile', drive.role],
      ['Specialization', joinList(drive.specialization)],
      ['Number of vacancies', drive.vacancies],
      ['Job location(s)', joinList(drive.locations)],
      ['Package / CTC / stipend', drive.ctc],
      ['Bond / service agreement', drive.bond],
    ] },
    { key: 'drive', title: 'Drive details', rows: [
      ['Mode of drive', drive.mode],
      ['Date of drive', formatDriveDate(drive.driveDate)],
      ['Reporting time', formatTime(drive.reportingTime)],
      [venueLabel(drive.mode), drive.venue],
      ['Selection process', rounds.map((round, index) => `${ORDINALS[index]} round: ${round}`).join('\n')],
    ] },
    { key: 'eligibility', title: 'Eligibility', rows: [
      ['Programme(s)', batches ? `${courses} (batch ${batches})` : courses],
      ['Class X', minText(drive.minTenth)],
      ['Class XII', minText(drive.minTwelfth)],
      ['Graduation', minText(drive.minGraduation)],
      ['MBA / MCA', minText(drive.minPG)],
      ['Graduation required', drive.graduationRequired],
      ['Active backlogs', drive.backlogs],
      ['Skills & other requirements', drive.requirements],
    ] },
    { key: 'apply', title: 'How to apply', rows: [
      ['Registration link', safeUrl(drive.registrationLink), 'link'],
      ['Last date to register', formatDriveDate(drive.applyBy)],
      ['Job description document', safeUrl(drive.jdLink), 'link'],
      ['Instructions', drive.howToApply],
      ['Documents to bring', drive.documents],
      ['Contact', drive.contact],
    ] },
  ]
  return sections
    .map((section) => ({ ...section, rows: section.rows.filter(([, value]) => text(value)) }))
    .filter((section) => section.rows.length)
}

/** Flat list of every row (older callers). */
export const driveDetailRows = (drive = {}) => driveSections(drive).flatMap((section) => section.rows)

const firstName = (name) => text(name).split(/\s+/)[0] || 'Student'

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
const htmlLines = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>')
const htmlLink = (url) => `<a href="${escapeHtml(url)}" style="color:#C2410C;font-weight:600;word-break:break-all;" target="_blank" rel="noopener">${escapeHtml(url)}</a>`

export function driveEmailSubject(drive = {}, { update = false } = {}) {
  const date = formatDriveDate(drive.driveDate, { weekday: false })
  return `${update ? 'Updated: ' : ''}Placement Drive — ${drive.company || 'Company'} | ${drive.role || 'Job role'} | ${date}`
}

/** One student's email: { subject, text, html }. */
export function buildDriveEmail(drive = {}, student = {}, { update = false, collegeName = 'Gian Jyoti Institute of Management & Technology', senderName = 'GJIMT Placement Cell' } = {}) {
  const subject = driveEmailSubject(drive, { update })
  const sections = driveSections(drive)
  const greeting = `Dear ${firstName(student.name)},`
  const intro = update
    ? `The details of the ${drive.company} placement drive have been updated. Please read the latest information below.`
    : `${drive.company} is conducting a placement drive for the role of ${drive.role}. You are receiving this because ${student.course || 'your course'} students are eligible to apply.`
  const register = safeUrl(drive.registrationLink)
  const applyBy = formatDriveDate(drive.applyBy)
  const about = text(drive.about)
  const jd = text(drive.summary)
  const notes = text(drive.notes)
  const closing = 'Please reach on time and carry the documents mentioned. For any questions, reply to this email or contact the Placement Cell.'

  const textBlocks = [
    greeting, '', intro,
    ...(about ? ['', `About ${drive.company}: ${about}`] : []),
    ...(register ? ['', `Register here${applyBy ? ` by ${applyBy}` : ''}: ${register}`] : []),
    ...sections.flatMap((section) => ['', section.title.toUpperCase(), ...section.rows.map(([label, value]) => `${label}: ${String(value).replace(/\n/g, '\n  ')}`)]),
    ...(jd ? ['', 'JOB DESCRIPTION (JD)', jd] : []),
    ...(notes ? ['', 'IMPORTANT NOTES', notes] : []),
    '', closing, '', 'Regards,', senderName, collegeName,
  ]

  const sectionHtml = sections.map((section) => `
        <tr><td style="padding:22px 26px 0;">
          <div style="color:#C2410C;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(section.title)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EDE7DD;border-radius:10px;border-collapse:separate;">${section.rows.map(([label, value, kind]) => `
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #EDE7DD;color:#646E7E;font-size:13px;font-weight:600;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #EDE7DD;color:#0F1B2D;font-size:14px;vertical-align:top;">${kind === 'link' ? htmlLink(value) : htmlLines(value)}</td>
            </tr>`).join('')}
          </table>
        </td></tr>`).join('')

  const block = (title, body) => `
        <tr><td style="padding:22px 26px 0;">
          <div style="color:#C2410C;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(title)}</div>
          <div style="color:#2B3445;font-size:14px;line-height:1.65;">${htmlLines(body)}</div>
        </td></tr>`

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F2EC;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E6E0D6;">
        <tr><td style="background:#0F1B2D;padding:22px 26px;border-bottom:4px solid #C2410C;">
          <div style="color:#E3C27A;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${update ? 'Drive update' : 'Placement opportunity'}</div>
          <div style="color:#FFFFFF;font-size:22px;font-weight:700;margin-top:6px;">${escapeHtml(drive.company)}</div>
          ${about ? `<div style="color:#E3C27A;font-size:13px;margin-top:3px;">${escapeHtml(about)}</div>` : ''}
          <div style="color:#C9D1DD;font-size:14px;margin-top:6px;">${escapeHtml(drive.role)}${drive.ctc ? ` · ${escapeHtml(drive.ctc)}` : ''}</div>
        </td></tr>
        <tr><td style="padding:24px 26px 0;color:#0F1B2D;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
          <p style="margin:0;">${escapeHtml(intro)}</p>
        </td></tr>
        ${register ? `<tr><td style="padding:18px 26px 0;">
          <a href="${escapeHtml(register)}" target="_blank" rel="noopener" style="display:inline-block;background:#C2410C;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:9px;">Register for this drive</a>
          ${applyBy ? `<span style="display:inline-block;margin-left:10px;color:#646E7E;font-size:13px;">Last date: <strong style="color:#0F1B2D;">${escapeHtml(applyBy)}</strong></span>` : ''}
        </td></tr>` : ''}
        ${sectionHtml}
        ${jd ? block('Job description (JD)', jd) : ''}
        ${notes ? block('Important notes', notes) : ''}
        <tr><td style="padding:22px 26px 26px;color:#2B3445;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 16px;">${escapeHtml(closing)}</p>
          <p style="margin:0;">Regards,<br><strong>${escapeHtml(senderName)}</strong><br><span style="color:#646E7E;">${escapeHtml(collegeName)}</span></p>
        </td></tr>
      </table>
      <div style="color:#8A93A3;font-size:12px;margin-top:14px;">Sent by the GJIMT Placement LMS to eligible ${escapeHtml(parseCourses(drive.eligible).join(', '))} students.</div>
    </td></tr>
  </table>
</body></html>`

  return { subject, text: textBlocks.join('\n'), html }
}

/* ---------- Form checks ---------- */

export const DRIVE_TEXT_LIMIT = 6000

/** { field: message } for anything missing or wrong — empty object when the drive can be saved. */
export function driveProblems(drive = {}) {
  const problems = {}
  const need = (key, message) => { if (!text(drive[key])) problems[key] = message }
  need('company', 'Enter the company name.')
  need('role', 'Enter the job role or profile.')
  need('summary', 'Write the job description (JD).')
  need('ctc', 'Enter the package, CTC or stipend, e.g. ₹4.5 LPA.')
  if (!splitList(drive.locations).length) problems.locations = 'Add at least one job location.'
  need('mode', 'Choose the mode of the drive.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(drive.driveDate ?? ''))) problems.driveDate = 'Choose the date of the drive.'
  if (!/^\d{1,2}:\d{2}/.test(String(drive.reportingTime ?? ''))) problems.reportingTime = 'Choose the reporting time.'
  if (!isVirtual(drive.mode)) need('venue', 'Enter the venue.')
  roundsOf(drive).forEach((_, index) => {
    const key = `round${index + 1}`
    if (!text(drive[key])) problems[key] = `Describe the ${ORDINALS[index]} round, e.g. Aptitude test.`
  })
  if (!parseCourses(drive.eligible).length) problems.eligible = 'Tick at least one programme.'
  need('requirements', 'Write the skills or other requirements (or “None”).')
  ;['website', 'registrationLink', 'jdLink'].forEach((key) => {
    if (text(drive[key]) && !normalizeUrl(drive[key])) problems[key] = 'Enter a web address, e.g. https://www.company.com'
  })
  if (drive.applyBy && !/^\d{4}-\d{2}-\d{2}$/.test(String(drive.applyBy))) problems.applyBy = 'Choose a valid date.'
  ;['minTenth', 'minTwelfth', 'minGraduation'].forEach((key) => {
    if (!text(drive[key])) return
    const value = percent(drive[key])
    if (value === null || value < 0 || value > 100) problems[key] = 'Enter a percentage from 0 to 100.'
  })
  ;['summary', 'requirements', 'howToApply', 'documents', 'notes'].forEach((key) => {
    if (String(drive[key] ?? '').length > DRIVE_TEXT_LIMIT) problems[key] = `Keep this under ${DRIVE_TEXT_LIMIT} characters.`
  })
  return problems
}

/** Email progress for a drive from its log: { total, sent, failed, queued }. */
export function emailCounts(log = []) {
  const counts = { total: log.length, sent: 0, failed: 0, queued: 0 }
  log.forEach((entry) => {
    if (entry.status === 'sent') counts.sent += 1
    else if (entry.status === 'failed') counts.failed += 1
    else counts.queued += 1
  })
  return counts
}
