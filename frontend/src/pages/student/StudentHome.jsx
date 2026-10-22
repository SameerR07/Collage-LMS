import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AppRegistrationRounded, ArrowForwardRounded, CampaignRounded, FactCheckRounded, HowToRegRounded, SchoolRounded, WorkHistoryRounded,
} from '@mui/icons-material'
import AppShell from '../../components/AppShell'
import PageBanner from '../../components/PageBanner'
import StudentGate from '../../components/StudentGate'
import { useAuth } from '../../context/AuthContext'
import { formatDriveDate, formatTime } from '../../lib/driveEmail'
import { listDrives, sortDrives, todayISO } from '../../lib/drives'
import { listMyApplications, listMyMarks, listSessions } from '../../lib/studentPortal'
import { driveEligibility, isActiveApplication, registrationProgress, studentAttendance } from '../../lib/studentRules'
import { dateParts, statusClass } from '../../lib/utils'

function Home({ record }) {
  const { user } = useAuth()
  const [data, setData] = useState({ drives: [], applications: [], sessions: [], marks: [], loading: true })
  useEffect(() => {
    let alive = true
    Promise.all([listDrives(), listMyApplications(user.email), listSessions(), listMyMarks(user.email)])
      .then(([drives, applications, sessions, marks]) => { if (alive) setData({ drives: sortDrives(drives), applications, sessions, marks, loading: false }) })
      .catch(() => { if (alive) setData((current) => ({ ...current, loading: false })) })
    return () => { alive = false }
  }, [user.email])

  const today = todayISO()
  const applied = useMemo(() => new Set(data.applications.filter(isActiveApplication).map((item) => item.driveId)), [data.applications])
  const openDrives = useMemo(() => data.drives.filter((drive) => !applied.has(drive.id) && driveEligibility(drive, record, today).canApply), [data.drives, applied, record, today])
  const attendance = useMemo(() => studentAttendance(data.sessions, data.marks, record, data.applications), [data, record])
  const openSessions = attendance.rows.filter((row) => row.status === 'Open now')
  const nextSessions = attendance.rows.filter((row) => row.status === 'Upcoming').reverse().slice(0, 3)
  const progress = registrationProgress(record)
  const first = String(record.name || user.displayName || 'Student').split(' ')[0]

  return <>
    <PageBanner
      icon={SchoolRounded}
      eyebrow="Student portal"
      title="Hello,"
      titleAccent={first}
      description={`${record.course || ''}${record.batch ? ` · Batch ${record.batch}` : ''}${record.rollNo ? ` · Roll No. ${record.rollNo}` : ''}`}
      tiles={[
        { label: 'Drives open for you', value: data.loading ? '…' : openDrives.length, note: 'You can apply now' },
        { label: 'My applications', value: data.loading ? '…' : data.applications.filter(isActiveApplication).length, note: data.applications.some((item) => item.status === 'Selected') ? 'You have been selected' : 'Active' },
        { label: 'Attendance', value: data.loading ? '…' : attendance.percent === null ? '—' : `${attendance.percent}%`, note: attendance.total ? `${attendance.attended} of ${attendance.total} session${attendance.total === 1 ? '' : 's'}` : 'No sessions yet' },
      ]}
    />

    {openSessions.length > 0 && <Link to="/student/attendance" className="setup-callout checkin-callout"><HowToRegRounded /><div><strong>Check-in is open: {openSessions.map((row) => row.session.title).join(', ')}</strong><p>Open Attendance and enter the code shown by the Placement Cell.</p></div><ArrowForwardRounded /></Link>}

    <div className="sp-home-grid">
      <section className="surface-card">
        <div className="surface-head"><div><span>Apply for placement</span><h3>Open for you</h3></div><CampaignRounded /></div>
        {data.loading ? <p className="muted-copy">Loading…</p> : !openDrives.length ? <p className="muted-copy">No drives are open for you right now. New drives for {record.course} reach you by email too.</p>
          : <ul className="sp-mini-list">{openDrives.slice(0, 4).map((drive) => { const day = dateParts(drive.driveDate); return <li key={drive.id}>
            <span className="date-tile small"><strong>{day.day}</strong><span>{day.month}</span></span>
            <div><strong>{drive.company}</strong><small>{drive.role}{drive.ctc ? ` · ${drive.ctc}` : ''}{drive.applyBy ? ` · apply by ${formatDriveDate(drive.applyBy, { weekday: false })}` : ''}</small></div>
          </li> })}</ul>}
        <Link to="/student/drives" className="text-link">See all drives <ArrowForwardRounded /></Link>
      </section>

      <section className="surface-card">
        <div className="surface-head"><div><span>Applications</span><h3>Where you stand</h3></div><WorkHistoryRounded /></div>
        {!data.applications.length ? <p className="muted-copy">You haven’t applied for any drive yet.</p>
          : <ul className="sp-mini-list">{data.applications.slice().sort((a, b) => String(b.appliedAt || '').localeCompare(String(a.appliedAt || ''))).slice(0, 5).map((item) => <li key={item.id}>
            <div><strong>{item.company}</strong><small>{item.role}{item.driveDate ? ` · ${formatDriveDate(item.driveDate, { weekday: false })}` : ''}</small></div>
            <span className={`status-badge ${statusClass(item.status)}`}><i />{item.status}</span>
          </li>)}</ul>}
        <Link to="/student/drives" className="text-link">My applications <ArrowForwardRounded /></Link>
      </section>

      <section className="surface-card">
        <div className="surface-head"><div><span>Attendance</span><h3>Coming up</h3></div><FactCheckRounded /></div>
        {!nextSessions.length ? <p className="muted-copy">No upcoming sessions for you.</p>
          : <ul className="sp-mini-list">{nextSessions.map(({ session }) => <li key={session.id}>
            <div><strong>{session.title}</strong><small>{formatDriveDate(session.date, { weekday: false })}{session.time ? `, ${formatTime(session.time)}` : ''}{session.venue ? ` · ${session.venue}` : ''}</small></div>
            <span className="status-badge upcoming"><i />{session.kind}</span>
          </li>)}</ul>}
        <Link to="/student/attendance" className="text-link">Attendance <ArrowForwardRounded /></Link>
      </section>

      <section className="surface-card">
        <div className="surface-head"><div><span>Registration</span><h3>Your record</h3></div><AppRegistrationRounded /></div>
        <div className="sp-progress" style={{ '--progress': `${progress}%` }}><span /></div>
        <p className="muted-copy">{progress}% of the registration form filled. Placement status: <span className={`status-badge ${statusClass(record.placementStatus)}`}><i />{record.placementStatus || '—'}</span></p>
        <Link to="/student/registration" className="text-link">Update registration <ArrowForwardRounded /></Link>
      </section>
    </div>
  </>
}

export default function StudentHome() {
  return <AppShell title="My Portal" subtitle="Student portal"><div className="page-stack">
    <StudentGate>{({ record }) => <Home record={record} />}</StudentGate>
  </div></AppShell>
}
