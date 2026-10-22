import { useCallback, useEffect, useMemo, useState } from 'react'
import { FactCheckRounded, HowToRegRounded, PlaceRounded, ScheduleRounded } from '@mui/icons-material'
import AppShell from '../../components/AppShell'
import PageBanner from '../../components/PageBanner'
import StudentGate from '../../components/StudentGate'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { formatDriveDate, formatTime } from '../../lib/driveEmail'
import { checkInWithCode, listMyApplications, listMyMarks, listSessions } from '../../lib/studentPortal'
import { cleanCode, studentAttendance } from '../../lib/studentRules'
import { statusClass } from '../../lib/utils'

function CheckInCard({ session, onCheckIn }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await onCheckIn(session, code); setCode('') } catch (err) { setError(err?.message || 'Check-in failed.') } finally { setBusy(false) }
  }
  return <form className="surface-card checkin-card" onSubmit={submit} data-session={session.title}>
    <div className="checkin-head">
      <span className="live-pill"><i /> Check-in open</span>
      <h3>{session.title}</h3>
      <p>{session.kind}{session.time ? ` · ${formatTime(session.time)}` : ''}{session.venue ? ` · ${session.venue}` : ''}</p>
    </div>
    <label className="field-label" htmlFor={`code-${session.id}`}>Code shown by the Placement Cell</label>
    <div className="checkin-row">
      <input id={`code-${session.id}`} className="code-input" value={code} onChange={(event) => { setCode(cleanCode(event.target.value).slice(0, 6)); setError('') }} placeholder="ABC123" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={6} aria-invalid={Boolean(error) || undefined} />
      <button className="primary-button" type="submit" disabled={busy || code.length !== 6}><HowToRegRounded /> {busy ? 'Checking…' : 'Mark me present'}</button>
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
  </form>
}

function AttendanceView({ record }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [data, setData] = useState({ sessions: [], marks: [], applications: [] })
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => Promise.all([listSessions(), listMyMarks(user.email), listMyApplications(user.email)])
    .then(([sessions, marks, applications]) => { setData({ sessions, marks, applications }); setLoading(false) }), [user.email])
  useEffect(() => {
    load().catch(() => { push('Could not load attendance.', 'error'); setLoading(false) })
    const timer = setInterval(() => { load().catch(() => {}) }, 20000) // check-in opens while the page is open
    return () => clearInterval(timer)
  }, [load, push])

  const summary = useMemo(() => studentAttendance(data.sessions, data.marks, record, data.applications), [data, record])
  const openNow = summary.rows.filter((row) => row.status === 'Open now')

  const checkIn = async (session, code) => {
    await checkInWithCode(record, session, code)
    push(`You are marked present for ${session.title}.`)
    await load()
  }

  return <>
    <PageBanner
      icon={FactCheckRounded}
      eyebrow="Student portal"
      title="My attendance"
      description="Placement drives, trainings and talks meant for your course. When a session starts, enter the code shown by the Placement Cell to mark yourself present."
      tiles={[
        { label: 'Attendance', value: loading ? '…' : summary.percent === null ? '—' : `${summary.percent}%`, note: summary.total ? `${summary.attended} of ${summary.total} session${summary.total === 1 ? '' : 's'}` : 'No sessions yet' },
        { label: 'Open now', value: loading ? '…' : openNow.length, note: openNow.length ? 'Enter the code below' : 'Nothing to check in' },
        { label: 'Upcoming', value: loading ? '…' : summary.rows.filter((row) => row.status === 'Upcoming').length, note: 'Sessions for you' },
      ]}
    />
    {openNow.length > 0 && <div className="checkin-grid">{openNow.map((row) => <CheckInCard key={row.session.id} session={row.session} onCheckIn={checkIn} />)}</div>}
    <section className="table-card">
      <div className="table-card-head"><div><strong>{summary.rows.length}</strong> session{summary.rows.length === 1 ? '' : 's'}</div><span>Marked by code or by the Placement Cell.</span></div>
      {loading ? <div className="skeleton-table" aria-busy="true"><div className="skeleton-row"><span className="skeleton-line wide" /></div></div>
        : !summary.rows.length ? <div className="empty-state"><span className="empty-art"><FactCheckRounded /></span><h3>No sessions yet</h3><p>Sessions for {record.course} appear here once the Placement Cell schedules them.</p></div>
          : <div className="data-table-wrap"><table className="data-table compact attendance-history">
            <thead><tr><th>Date</th><th>Session</th><th>Type</th><th>Venue</th><th>Status</th></tr></thead>
            <tbody>{summary.rows.map(({ session, mark, status }) => <tr key={session.id} data-status={status}>
              <td className="nowrap"><ScheduleRounded className="inline-icon" /> {formatDriveDate(session.date, { weekday: false })}{session.time ? `, ${formatTime(session.time)}` : ''}</td>
              <td><strong>{session.title}</strong>{session.company ? <small className="sub-line">{session.company}</small> : null}</td>
              <td>{session.kind}</td>
              <td>{session.venue ? <><PlaceRounded className="inline-icon" /> {session.venue}</> : '—'}</td>
              <td><span className={`status-badge ${statusClass(status)}`}><i />{status}</span>{mark?.method === 'Code' && <small className="sub-line">checked in with code</small>}</td>
            </tr>)}</tbody>
          </table></div>}
    </section>
  </>
}

export default function StudentAttendance() {
  return <AppShell title="Attendance" subtitle="Student portal"><div className="page-stack">
    <StudentGate>{({ record }) => <AttendanceView record={record} />}</StudentGate>
  </div></AppShell>
}
