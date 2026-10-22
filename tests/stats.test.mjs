// Login-page Quick Stats rules — run with:  npm test
import assert from 'node:assert/strict'
import { cleanStats, companyKey, computeLoginStats, formatCount, formatRate } from '../frontend/src/lib/statsCore.js'

let passed = 0
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }
const NOW = new Date('2026-10-06T10:00:00')

console.log('Quick Stats')
test('no data → zeros, rate unknown, no trend', () => {
  const stats = computeLoginStats({}, NOW)
  assert.equal(stats.totalStudents, 0)
  assert.equal(stats.recruitingCompanies, 0)
  assert.equal(stats.placementRate, null)
  assert.equal(stats.companyTrend, null)
  assert.equal(formatRate(stats.placementRate), '—')
})
test('placement rate = placed ÷ all students (same as the Dashboard), rounded', () => {
  const students = [
    { placementStatus: 'Placed' }, { placementStatus: 'Placed' }, { placementStatus: 'Eligible' },
    { placementStatus: 'Opted Out' }, { placementStatus: 'Not Eligible' }, { placementStatus: 'In Process' },
  ]
  const stats = computeLoginStats({ students }, NOW)
  assert.equal(stats.totalStudents, 6)
  assert.equal(stats.placed, 2)
  assert.equal(stats.placementRate, 33)
})
test('company names are matched ignoring case, spaces and "Pvt. Ltd." style endings', () => {
  assert.equal(companyKey('Alpha IT Pvt. Ltd.'), 'alpha it')
  assert.equal(companyKey('  ALPHA it private limited '), 'alpha it')
  assert.equal(companyKey('Tata Consultancy Services Limited'), 'tata consultancy services')
  assert.equal(companyKey(''), '')
  assert.equal(companyKey(null), '')
})
test('companies counted once across drives, internships and students’ company', () => {
  const stats = computeLoginStats({
    placements: [{ company: 'TechNova Solutions', driveDate: '2026-10-08' }, { company: 'FinEdge Services', driveDate: '2026-09-02' }],
    internships: [{ company: 'Alpha IT Pvt. Ltd.', startDate: '2026-07-01' }, { company: 'finedge services', startDate: '2026-08-01' }],
    students: [{ company: 'Alpha IT Private Limited', placementStatus: 'Placed' }, { company: 'BrightWorks' }, { company: '' }, {}],
  }, NOW)
  assert.equal(stats.recruitingCompanies, 4) // TechNova, FinEdge, Alpha IT, BrightWorks
})
test('company trend: companies seen by the end of each of the last 6 months', () => {
  const stats = computeLoginStats({
    placements: [{ company: 'A', driveDate: '2026-05-10' }, { company: 'B', driveDate: '2026-08-20' }, { company: 'C', driveDate: '2026-10-01' }, { company: 'D', driveDate: '2026-12-01' }],
    internships: [{ company: 'A', startDate: '2026-04-01' }],
    students: [{ company: 'E' }],
  }, NOW)
  // May … Oct 2026: A (Apr) counts from May; B from Aug; C from Oct; D is in the future; E has no date
  assert.deepEqual(stats.companyTrend, [1, 1, 1, 2, 2, 3])
  assert.equal(stats.recruitingCompanies, 5)
})
test('numbers format the Indian way; summaries from the cloud are sanitised', () => {
  assert.equal(formatCount(125000), '1,25,000')
  assert.equal(formatCount(undefined), '—')
  assert.deepEqual(cleanStats({ totalStudents: '30', recruitingCompanies: -2, placed: 3, placementRate: 140, companyTrend: [1, 'x', 3], updatedAt: 5 }),
    { totalStudents: 30, recruitingCompanies: 0, placed: 3, placementRate: 100, companyTrend: [1, 0, 3], updatedAt: null })
  assert.equal(cleanStats(null), null)
  assert.equal(cleanStats({ placementRate: null }).placementRate, null)
})

console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
