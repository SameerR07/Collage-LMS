/* =========================================================
   Who can open what.
   Admin           everything (all sections, users, drives, attendance, emails)
   Placement Cell  Placement Drive desk, Attendance, Email outbox (+ own settings)
   Student         own portal only: registration, apply for drives, attendance
========================================================= */

export const ROLE_INFO = {
  admin: {
    label: 'Admin',
    home: '/',
    blurb: 'Full control of every section, record and user.',
    signUp: false,
  },
  placement: {
    label: 'Placement Cell',
    home: '/drives',
    blurb: 'Post placement drives and email eligible students.',
    signUp: true,
  },
  student: {
    label: 'Student',
    home: '/student',
    blurb: 'Register, apply for placement drives and mark attendance.',
    signUp: true,
    // Student accounts work straight away — the email links them to their Master Data record
    autoActive: true,
  },
}

export const ROLES = Object.keys(ROLE_INFO)
export const isRole = (role) => ROLES.includes(role)
export const roleLabel = (role) => ROLE_INFO[role]?.label || 'User'
export const homeFor = (role) => ROLE_INFO[role]?.home || '/login'

/** Account status: pending = waiting for Admin approval, disabled = switched off by Admin. */
export const STATUS_LABEL = { active: 'Active', pending: 'Waiting for approval', disabled: 'Switched off' }

const PLACEMENT_PATHS = ['/drives', '/attendance', '/emails', '/settings']
const STUDENT_PATHS = ['/student', '/settings']
const under = (path, base) => path === base || path.startsWith(`${base}/`)

/** The student portal (/student…) — note '/students' (Master Data) is a different page. */
export const isStudentArea = (path = '') => under(path, '/student')

/** true when this role may open this path (e.g. '/drives/abc/edit'). */
export function canAccess(role, path = '/') {
  if (isStudentArea(path)) return role === 'student' // a student's own pages need a student account
  if (role === 'admin') return true
  if (role === 'placement') return PLACEMENT_PATHS.some((base) => under(path, base))
  if (role === 'student') return STUDENT_PATHS.some((base) => under(path, base))
  return false
}

/** Why an account cannot sign in through the portal the person chose — or '' when it can. */
export function signInProblem(account, chosenRole) {
  if (!account) return 'No account found for this email.'
  if (chosenRole && account.role !== chosenRole) {
    return `This is ${account.role === 'admin' ? 'an' : 'a'} ${roleLabel(account.role)} account — choose “Login as ${roleLabel(account.role)}” instead.`
  }
  if (account.status === 'pending') return 'Your account is waiting for the Admin’s approval. You can sign in once it is approved.'
  if (account.status === 'disabled') return 'This account has been switched off by the Admin.'
  return ''
}
