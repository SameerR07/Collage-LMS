import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  AutorenewRounded, DeleteOutlineRounded, FactCheckRounded, FileDownloadRounded, LockOpenRounded, LockRounded, PersonOffRounded, SearchRounded,
} from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { listRecords } from '../lib/dataStore'
import { formatDriveDate, formatTime } from '../lib/driveEmail'
import { safeSheetName } from '../lib/importer'
import { logActivity } from '../lib/activity'
import { deleteSession, getSession, getSessionCode, listAllApplications, listSessionMarks, markStudent, newSessionCode, setCheckIn } from '../lib/studentPortal'
import { MARK_STATUSES, normEmail, sessionAudience, sessionCounts } from '../lib/studentRules'
import { friendlyDateTime } from '../lib/utils'

export default function AttendanceSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { push } = useToast()
  const [session, setSession] = useState(null)
  const [code, setCode] = useState('')
  const [students, setStudents] = useState([])
  const [applications, setApplications] = useState([])
  const [marks, setMarks] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const by = user?.displayName || user?.email || 'Placement Cell'

  useEffect(() => {
    let alive = true
    Promise.all([getSession(id), getSessionCode(id), listRecords('students'), listAllApplications(), listSessionMarks(id)])
      .then(([found, sessionCode, allStudents, allApplications, sessionMarks]) => {
        if (!alive) return
        if (!found) { push('That session no longer exists.', 'error'); navigate('/attendance', { replace: true }); return }
        setSession(found); setCode(sessionCode); setStudents(allStudents); setApplications(allApplications); setMarks(sessionMarks)
      })
      .catch(() => push('Could not load the session.', 'error'))
    return () => { alive = false }
  }, [id, navigate, push])

  // While check-in is open, keep the list fresh as students check in
  useEffect(() => {
    if (session?.checkIn !== 'Open') return undefined
    const timer = setInterval(() => { listSessionMarks(id).then(setMarks).catch(() => {}) }, 5000)
    return () => clearInterval(timer)
  }, [session?.checkIn, id])

  const audience = useMemo(() => (session ? sessionAudience(session, students, applications) : []), [session, students, applications])
  const markByEmail = useMemo(() => new Map(marks.map((mark) => [normEmail(mark.studentEmail), mark])), [marks])
  // Someone marked who is no longer in the audience (e.g. course changed) still shows up
  const extra = useMemo(() => marks.filter((mark) => !audience.some((student) => normEmail(student.email) === normEmail(mark.studentEmail))).map((mark) => ({ id: mark.studentId, email: mark.studentEmail, name: mark.name, rollNo: mark.rollNo, course: mark.course, batch: mark.batch })), [marks, audience])
  const everyone = [...audience, ...extra]
  const counts = sessionCounts(everyone, marks)
  const term = search.trim().toLowerCase()
  const shown = everyone.filter((student) => !term || [student.name, student.rollNo, student.email, student.course].some((value) => String(value || '').toLowerCase().includes(term)))

  const mark = async (student, status) => {
    try {
      const saved = await markStudent(session, student, status, by)
      setMarks((current) => [...current.filter((item) => normEmail(item.studentEmail) !== normEmail(student.email)), saved])
    } catch (error) { push(error?.message || 'Could not save.', 'error') }
  }

  const markRestAbsent = async () => {
    const rest = everyone.filter((student) => !markByEmail.has(normEmail(student.email)))
    if (!rest.length) return 0
    for (const student of rest) await markStudent(session, student, 'Absent', by)
    setMarks(await listSessionMarks(id))
    return rest.length
  }

  const toggleCheckIn = async () => {
    setBusy(true)
    try {
      if (session.checkIn === 'Open') {
        if (!window.confirm('Close check-in? Students can no longer mark themselves present with the code.')) return
        await setCheckIn(id, 'Closed')
        setSession((current) => ({ ...current, checkIn: 'Closed' }))
        const unmarked = everyone.filter((student) => !markByEmail.has(normEmail(student.email))).length
        push(unmarked ? `Check-in closed. ${unmarked} not marked — use “Mark the rest absent” if they were absent.` : 'Check-in closed.', unmarked ? 'info' : 'success')
      } else {
        await setCheckIn(id, 'Open')
        setSession((current) => ({ ...current, checkIn: 'Open' }))
        push('Check-in is open — show the code to the students.')
      }
    } finally { setBusy(false) }
  }

  const exportExcel = () => {
    const rows = everyone.map((student, index) => {
      const entry = markByEmail.get(normEmail(student.email))
      return { 'S.No.': index + 1, Name: student.name, 'Uni. Roll No.': student.rollNo, Course: student.course, Batch: student.batch, Email: student.email, Status: entry?.status || 'Not marked', 'Marked by': entry ? (entry.method === 'Code' ? 'Student (code)' : entry.by || 'Placement Cell') : '', Time: entry?.at ? entry.at.replace('T', ' ').slice(0, 16) : '' }
    })
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = Object.keys(rows[0] || { Name: '' }).map((key) => ({ wch: Math.min(40, Math.max(10, key.length + 2, ...rows.map((row) => String(row[key] ?? '').length + 2))) }))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, safeSheetName('Attendance'))
    XLSX.writeFile(book, `attendance-${session.date}-${String(session.title).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.xlsx`)
    push('Attendance downloaded.', 'info')
    logActivity(`Downloaded attendance — ${session.title}`, { area: 'Attendance', category: 'download', detail: `${everyone.length} students` })
  }

  const remove = async () => {
    if (!window.confirm(`Delete “${session.title}” and its ${marks.length} attendance mark${marks.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    await deleteSession(id, marks)
    push('Session deleted.', 'info')
    navigate('/attendance', { replace: true })
  }

  if (!session) return <AppShell title="Attendance" subtitle="Placement Cell"><div className="page-stack"><div className="skeleton-table" aria-busy="true"><div className="skeleton-row"><span className="skeleton-line wide" /></div></div></div></AppShell>

  const isOpen = session.checkIn === 'Open'
  return <AppShell title={session.title} subtitle="Attendance"><div className="page-stack">
    <PageBanner
      icon={FactCheckRounded}
      eyebrow={session.kind}
      title={session.title}
      description={`${formatDriveDate(session.date)}${session.time ? `, ${formatTime(session.time)}` : ''}${session.venue ? ` · ${session.venue}` : ''} · ${session.audience === 'applicants' ? 'Applicants of the drive' : `${session.courses}${session.batches ? ` (${session.batches})` : ''}`}`}
      back={{ to: '/attendance', label: 'All sessions' }}
      actions={<div className="banner-button-row">
        <button type="button" className={isOpen ? 'soft-button on-dark' : 'primary-button'} disabled={busy} onClick={toggleCheckIn}>{isOpen ? <><LockRounded /> Close check-in</> : <><LockOpenRounded /> Open check-in</>}</button>
        <button type="button" className="soft-button on-dark" onClick={exportExcel} disabled={!everyone.length}><FileDownloadRounded /> Excel</button>
        <button type="button" className="soft-button on-dark danger-text" onClick={remove}><DeleteOutlineRounded /> Delete</button>
      </div>}
      tiles={[
        { label: 'Present', value: counts.present + counts.late, note: counts.late ? `${counts.late} late` : `of ${counts.expected} expected` },
        { label: 'Absent', value: counts.absent, note: 'Marked absent' },
        { label: 'Not marked', value: counts.unmarked, note: isOpen ? 'Still checking in' : 'No mark yet' },
      ]}
    />

    <section className={`surface-card code-card ${isOpen ? 'is-open' : ''}`}>
      <div>
        <span className="code-label">{isOpen ? 'Check-in code — show this to the students' : session.checkIn === 'Closed' ? 'Check-in is closed' : 'Check-in code (opens when you press “Open check-in”)'}</span>
        <strong className="code-display" aria-label={`Code ${code.split('').join(' ')}`}>{code || '——————'}</strong>
        <p>Students sign in to the student portal → Attendance → type the code. {isOpen ? 'The list below updates every few seconds.' : ''}</p>
      </div>
      <div className="code-actions">
        <button type="button" className="soft-button" onClick={async () => { setCode(await newSessionCode(id)); push('New code made — the old one no longer works.', 'info') }}><AutorenewRounded /> New code</button>
        <button type="button" className="soft-button" disabled={!counts.unmarked} onClick={async () => { const n = await markRestAbsent(); if (n) push(`${n} marked absent.`, 'info') }}><PersonOffRounded /> Mark the rest absent</button>
      </div>
    </section>

    <section className="table-card">
      <div className="table-card-head"><div><strong>{everyone.length}</strong> student{everyone.length === 1 ? '' : 's'} expected</div>
        <label className="toolbar-search small"><SearchRounded /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, roll no…" aria-label="Search students" /></label>
      </div>
      {!everyone.length ? <div className="empty-state"><span className="empty-art"><FactCheckRounded /></span><h3>No students match</h3><p>{session.audience === 'applicants' ? 'Nobody has applied for the linked drive yet.' : 'No students of these courses are in the Master Data.'}</p></div>
        : <div className="data-table-wrap"><table className="data-table compact attendance-table">
          <thead><tr><th>Student</th><th>Course</th><th>Mark</th><th>How</th></tr></thead>
          <tbody>{shown.map((student) => { const entry = markByEmail.get(normEmail(student.email)); return <tr key={student.email} data-email={normEmail(student.email)} data-status={entry?.status || 'none'}>
            <td><strong>{student.name}</strong><small className="sub-line">{student.rollNo || '—'} · {student.email}</small></td>
            <td className="nowrap">{student.course}{student.batch ? ` · ${student.batch}` : ''}</td>
            <td><div className="mark-toggle" role="radiogroup" aria-label={`Attendance for ${student.name}`}>{MARK_STATUSES.map((status) => <button key={status} type="button" role="radio" aria-checked={entry?.status === status} className={`${entry?.status === status ? `on ${status.toLowerCase()}` : ''}`} onClick={() => mark(student, status)}>{status}</button>)}</div></td>
            <td className="nowrap muted-cell">{entry ? `${entry.method === 'Code' ? 'Code' : 'Marked'} · ${friendlyDateTime(entry.at)}` : '—'}</td>
          </tr> })}</tbody>
        </table></div>}
    </section>
  </div></AppShell>
}
