// Activity log rules — run with:  npm test
import assert from 'node:assert/strict'
import {
  changedKeys, describeChange, deviceLabel, formatDuration, inPeriod, minutesIn, pageLabel, sessionMinutes, sessionState,
} from '../frontend/src/lib/activityRules.js'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }
const staff = { role: 'placement' }
const student = { role: 'student' }

console.log('What gets written in the log')
await test('adds, edits (only fields that really changed) and deletes read like sentences', () => {
  assert.deepEqual(describeChange({ type: 'add', name: 'placements', id: 'd1', record: { company: 'ICICI Bank', role: 'RM' } }, staff), { area: 'Placement Drives', category: 'change', action: 'Added placement drive “ICICI Bank — RM”' })
  const before = { id: 's1', name: 'Aman Gill', phone: '9876500001', address: 'Mohali', course: 'MBA' }
  const edit = describeChange({ type: 'update', name: 'students', id: 's1', before, changes: { ...before, phone: '9876511111', address: 'Kharar', updatedAt: 'x' } }, { role: 'admin' })
  assert.equal(edit.action, 'Edited student “Aman Gill”'); assert.equal(edit.detail, 'Phone Number 1, Address')
  assert.equal(describeChange({ type: 'update', name: 'students', id: 's1', before, changes: { ...before } }, staff), null, 'nothing changed → nothing logged')
  assert.equal(describeChange({ type: 'delete', name: 'visits', id: 'v1', before: { organization: 'STPI Mohali' } }, staff).action, 'Deleted industrial visit “STPI Mohali”')
  assert.match(describeChange({ type: 'delete', name: 'talks', id: 'abcdef123456' }, staff).action, /Deleted talk “#abcdef12”/)
  assert.deepEqual(describeChange({ type: 'import', name: 'students', created: 20, updated: 5 }, { role: 'admin' }), { area: 'Master Data', category: 'import', action: 'Imported 25 records into Master Data', detail: '20 added, 5 updated' })
})
await test('the log itself, the email queue and check-in codes are never logged; email progress on a drive is skipped', () => {
  for (const name of ['activity', 'loginSessions', 'outbox', 'attendanceCodes']) assert.equal(describeChange({ type: 'add', name, record: {} }, staff), null, name)
  assert.equal(describeChange({ type: 'update', name: 'placements', id: 'd1', before: { company: 'X' }, changes: { emailLog: [1], emailSummary: '1 sent' } }, staff), null)
  const edit = describeChange({ type: 'update', name: 'placements', id: 'd1', before: { company: 'X', venue: 'A' }, changes: { venue: 'B', emailLog: [1] } }, staff)
  assert.equal(edit.detail, 'Venue / meeting link', 'email fields are left out of the list')
})
await test('applications, attendance and student registration get their own wording', () => {
  assert.equal(describeChange({ type: 'set', name: 'applications', id: 'a', record: { name: 'Aman', company: 'ICICI Bank', role: 'RM', status: 'Applied' }, changes: { status: 'Applied' } }, student).action, 'Applied for ICICI Bank — RM')
  const again = describeChange({ type: 'set', name: 'applications', id: 'a', before: { status: 'Withdrawn', name: 'Aman', company: 'ICICI Bank' }, changes: { status: 'Applied' } }, student)
  assert.equal(again.detail, 'Applied again after withdrawing')
  assert.equal(describeChange({ type: 'set', name: 'applications', id: 'a', before: { status: 'Applied', company: 'ICICI Bank' }, changes: { status: 'Withdrawn' } }, student).action, 'Withdrew the application for ICICI Bank')
  const status = describeChange({ type: 'update', name: 'applications', id: 'a', before: { status: 'Applied', name: 'Aman Gill', company: 'ICICI Bank', roundsCleared: '' }, changes: { status: 'Shortlisted', roundsCleared: '2', history: [] } }, staff)
  assert.equal(status.action, 'Updated Aman Gill’s application (ICICI Bank)'); assert.equal(status.detail, 'status → Shortlisted · rounds cleared → 2')
  assert.equal(describeChange({ type: 'update', name: 'attendance', id: 's', before: { title: 'Aptitude training', checkIn: 'Not started' }, changes: { checkIn: 'Open', openedAt: 'x' } }, staff).action, 'Opened check-in: Aptitude training')
  assert.equal(describeChange({ type: 'set', name: 'attendanceMarks', id: 'm', record: { name: 'Aman', status: 'Present', sessionTitle: 'Aptitude training', method: 'Code' }, changes: { method: 'Code', status: 'Present' } }, student).action, 'Checked in with the code — Aptitude training')
  assert.equal(describeChange({ type: 'set', name: 'attendanceMarks', id: 'm', record: { name: 'Neha Rani', status: 'Late', sessionTitle: 'Aptitude training' }, changes: { status: 'Late' } }, staff).action, 'Marked Neha Rani Late — Aptitude training')
  assert.equal(describeChange({ type: 'add', name: 'students', id: 'n', record: { name: 'Neha', rollNo: '2523150', course: 'MBA', batch: '2025-27' } }, student).detail, '2523150 · MBA · 2025-27')
  assert.equal(describeChange({ type: 'update', name: 'students', id: 'n', before: { name: 'Neha', phone: '1' }, changes: { phone: '2' } }, student).action, 'Updated own registration')
  assert.deepEqual(changedKeys({ a: 1, b: 2, updatedAt: 'x' }, { a: 1, b: 3 }), ['b'])
})

console.log('Sign-in sessions')
const now = new Date(2026, 9, 9, 14, 0) // 9 Oct 2026, 2 PM local time (works in any time zone)
const local = (day, hour = 10) => new Date(2026, 9, day, hour, 0).toISOString()
const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60000).toISOString()
await test('online now / signed out / left without signing out', () => {
  assert.equal(sessionState({ startedAt: at(40), lastSeenAt: at(1) }, now).key, 'online')
  assert.deepEqual(sessionState({ startedAt: at(40), lastSeenAt: at(10), endedAt: at(10), endReason: 'Signed out' }, now), { key: 'ended', label: 'Signed out', at: at(10) })
  assert.equal(sessionState({ startedAt: at(90), lastSeenAt: at(30) }, now).label, 'Left without signing out')
})
await test('time in the LMS', () => {
  assert.equal(Math.round(sessionMinutes({ startedAt: at(40), lastSeenAt: at(1) }, now)), 40, 'online → until now')
  assert.equal(Math.round(sessionMinutes({ startedAt: at(90), lastSeenAt: at(30) }, now)), 60, 'left → until last seen')
  assert.equal(Math.round(sessionMinutes({ startedAt: at(90), lastSeenAt: at(5), endedAt: at(5) }, now)), 85)
  assert.equal(formatDuration(0.4), 'under 1 min'); assert.equal(formatDuration(12), '12 min'); assert.equal(formatDuration(65), '1 h 05 min'); assert.equal(formatDuration(120), '2 h')
  const day = [{ startedAt: at(120), lastSeenAt: at(60), endedAt: at(60) }, { startedAt: at(20), lastSeenAt: at(0) }, { startedAt: local(1, 9), lastSeenAt: local(1), endedAt: local(1) }]
  assert.equal(Math.round(minutesIn(day, 'today', now)), 80)
})
await test('periods, device names and page names', () => {
  assert.ok(inPeriod(at(30), 'today', now)); assert.ok(!inPeriod(local(1), 'today', now))
  assert.ok(inPeriod(local(3), '7d', now)); assert.ok(!inPeriod(local(2), '7d', now))
  assert.ok(inPeriod(local(1), '2026-10-01', now)); assert.ok(inPeriod('2020-01-01T00:00:00Z', 'all', now)); assert.ok(!inPeriod('', 'all', now))
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'), 'Chrome on Windows')
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'), 'Edge on Windows')
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone')
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), 'Chrome on Android phone')
  assert.equal(pageLabel('/drives'), 'Placement Drives'); assert.equal(pageLabel('/drives/abc'), 'Placement drive'); assert.equal(pageLabel('/drives/abc/edit'), 'Placement drive (edit)')
  assert.equal(pageLabel('/students/add'), 'Add Student'); assert.equal(pageLabel('/student/drives'), 'Apply for Placement'); assert.equal(pageLabel('/attendance/xyz'), 'Attendance session'); assert.equal(pageLabel('/activity'), 'Activity log')
})
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
