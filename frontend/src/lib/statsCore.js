/* =========================================================
   Quick Stats for the login page — pure calculations (no
   browser or Firebase code here, so it can be unit-tested).

   Total Students        number of records in Master Data
   Recruiting Companies  different companies across Placement
                         drives, Internships and the students'
                         "Company" field (spelling of "Pvt. Ltd.",
                         "Limited", case and spaces ignored)
   Placement Rate        Placed students ÷ all students — the same
                         rule the Dashboard uses, so both match
   companyTrend          companies seen so far at the end of each
                         of the last 6 months (dated drives and
                         internships only); null when there are none
========================================================= */

const LEGAL_SUFFIX = /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co)\b\.?/g

/** "Alpha IT Pvt. Ltd." and "alpha it private limited" → "alpha it" */
export function companyKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,()'’"-]/g, ' ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
const parseDate = (value) => {
  if (!value) return null
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function computeLoginStats({ students = [], placements = [], internships = [] } = {}, now = new Date()) {
  const totalStudents = students.length
  const placed = students.filter((student) => student?.placementStatus === 'Placed').length

  const companies = new Map() // key → earliest dated engagement (or null when undated)
  const remember = (name, date = null) => {
    const key = companyKey(name)
    if (!key) return
    const known = companies.get(key)
    if (!companies.has(key) || (date && (!known || date < known))) companies.set(key, date || known || null)
  }
  placements.forEach((drive) => remember(drive?.company, parseDate(drive?.driveDate)))
  internships.forEach((internship) => remember(internship?.company, parseDate(internship?.startDate)))
  students.forEach((student) => remember(student?.company))

  const dated = [...companies.values()].filter(Boolean)
  const companyTrend = dated.length
    ? Array.from({ length: 6 }, (_, index) => {
      const end = monthEnd(new Date(now.getFullYear(), now.getMonth() - 5 + index, 1))
      return dated.filter((date) => date <= end).length
    })
    : null

  return {
    totalStudents,
    recruitingCompanies: companies.size,
    placed,
    placementRate: totalStudents ? Math.round((placed / totalStudents) * 100) : null,
    companyTrend,
    updatedAt: now.toISOString(),
  }
}

const numberFormat = new Intl.NumberFormat('en-IN')
export const formatCount = (value) => (Number.isFinite(value) ? numberFormat.format(value) : '—')
export const formatRate = (value) => (Number.isFinite(value) ? `${value}%` : '—')

/** Accepts anything (e.g. a Firestore doc) and returns a safe stats object, or null. */
export function cleanStats(raw) {
  if (!raw || typeof raw !== 'object') return null
  const count = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.max(0, Math.round(Number(value))) : null)
  const rate = count(raw.placementRate)
  const trend = Array.isArray(raw.companyTrend) && raw.companyTrend.length >= 2 ? raw.companyTrend.map((value) => count(value) ?? 0) : null
  return {
    totalStudents: count(raw.totalStudents),
    recruitingCompanies: count(raw.recruitingCompanies),
    placed: count(raw.placed),
    placementRate: rate === null ? null : Math.min(100, rate),
    companyTrend: trend,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  }
}
