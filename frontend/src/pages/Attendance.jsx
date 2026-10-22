import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddRounded, CheckRounded, FactCheckRounded, PlaceRounded, ScheduleRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import Modal from '../components/Modal'
import PageBanner from '../components/PageBanner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { listRecords } from '../lib/dataStore'
import { DRIVE_COURSES, formatTime, parseCourses } from '../lib/driveEmail'
import { listDrives, sortDrives, todayISO } from '../lib/drives'
import { createSession, listAllApplications, listSessions } from '../lib/studentPortal'
import { ATTENDANCE_MARKS, SESSION_KINDS, sessionAudience, sessionCounts } from '../lib/studentRules'
import { dateParts } from '../lib/utils'

const blankForm = () => ({ title: '', kind: 'Training', date: todayISO(), time: '', venue: '', driveId: '', company: '', audience: 'courses', courses: [], batches: '', announce: true })
const CHECK_IN_TEXT = { 'Not started': 'Not started', Open: 'Check-in open', Closed: 'Closed' }
const CHECK_IN_CLASS = { 'Not started': 'upcoming', Open: 'open', Closed: 'closed' }

export default function Attendance() {
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState({ sessions: [], drives: [], students: [], applications: [], marks: [] })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('upcoming')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blankForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([listSessions(), listDrives(), listRecords('students'), listAllApplications(), listRecords(ATTENDANCE_MARKS)])
      .then(([sessions, drives, students, applications, marks]) => { if (alive) setData({ sessions, drives: sortDrives(drives), students, applications, marks }) })
      .catch(() => push('Could not load attendance.', 'error'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [push])

  const today = todayISO()
  const rows = useMemo(() => data.sessions
    .map((session) => {
      const audience = sessionAudience(session, data.students, data.applications)
      return { session, counts: sessionCounts(audience, data.marks.filter((mark) => mark.sessionId === session.id)) }
    })
    .sort((a, b) => (view === 'past' ? String(b.session.date).localeCompare(String(a.session.date)) : String(a.session.date).localeCompare(String(b.session.date)))),
  [data, view])
  const shown = rows.filter(({ session }) => (view === 'all' ? true : view === 'past' ? String(session.date) < today && session.checkIn !== 'Open' : String(session.date) >= today || session.checkIn === 'Open'))
  const closedCount = rows.filter(({ session }) => session.checkIn === 'Closed').length
  const average = (() => {
    const done = rows.filter(({ session, counts }) => session.checkIn === 'Closed' && counts.expected)
    if (!done.length) return null
    return Math.round(done.reduce((sum, { counts }) => sum + ((counts.present + counts.late) / counts.expected) * 100, 0) / done.length)
  })()

  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })) }
  const pickDrive = (driveId) => {
    const drive = data.drives.find((item) => item.id === driveId)
    if (!drive) { setForm((current) => ({ ...current, driveId: '', company: '', audience: 'courses' })); return }
    setForm((current) => ({
      ...current, driveId, company: drive.company,
      title: current.title || `${drive.company} — ${drive.role}`,
      kind: current.kind === 'Training' ? 'Placement drive' : current.kind,
      date: drive.driveDate || current.date, time: drive.reportingTime || current.time, venue: drive.venue || current.venue,
      courses: parseCourses(drive.eligible), batches: drive.batches || current.batches,
    }))
  }
  const toggleCourse = (course) => set('courses', form.courses.includes(course) ? form.courses.filter((item) => item !== course) : [...form.courses, course])
  const preview = sessionAudience({ ...form, courses: form.courses.join(', ') }, data.students, data.applications).length

  const submit = async (event) => {
    event.preventDefault()
    const problems = {}
    if (!form.title.trim()) problems.title = 'Give the session a title.'
    if (!form.date) problems.date = 'Pick the date.'
    if (form.audience === 'courses' && !form.courses.length) problems.courses = 'Tick at least one course.'
    if (form.audience === 'applicants' && !form.driveId) problems.driveId = 'Choose the drive whose applicants should attend.'
    setErrors(problems)
    if (Object.values(problems).some(Boolean)) return
    setSaving(true)
    try {
      const values = { title: form.title.trim(), kind: form.kind, date: form.date, time: form.time, venue: form.venue.trim(), driveId: form.driveId, company: form.company, audience: form.audience, courses: form.courses.join(', '), batches: form.batches.trim() }
      const { session, announced } = await createSession(values, { by: user?.displayName || user?.email || 'Placement Cell', announce: form.announce, students: data.students, applications: data.applications })
      push(announced ? `Session created — ${announced} student email${announced === 1 ? '' : 's'} queued.` : 'Session created.')
      setOpen(false); setForm(blankForm())
      navigate(`/attendance/${session.id}`)
    } catch (error) {
      push(error?.message || 'The session could not be created.', 'error')
    } finally { setSaving(false) }
  }

  return <AppShell title="Attendance" subtitle={user?.role === 'admin' ? 'Workspace' : 'Placement Cell'}><div className="page-stack">
    <PageBanner
      icon={FactCheckRounded}
      eyebrow="Placement Cell"
      title="Attendance"
      description="Create a session for a drive, training or talk. Open check-in and show the code — students mark themselves present in the student portal, or you mark them here."
      actions={<div className="banner-button-row"><button type="button" className="primary-button" onClick={() => { setForm(blankForm()); setErrors({}); setOpen(true) }}><AddRounded /> New session</button></div>}
      tiles={[
        { label: 'Upcoming sessions', value: loading ? '…' : rows.filter(({ session }) => String(session.date) >= today && session.checkIn !== 'Closed').length, note: `${data.sessions.length} in total` },
        { label: 'Check-in open', value: loading ? '…' : rows.filter(({ session }) => session.checkIn === 'Open').length, note: 'Right now' },
        { label: 'Average attendance', value: loading ? '…' : average === null ? '—' : `${average}%`, note: closedCount ? `${closedCount} closed session${closedCount === 1 ? '' : 's'}` : 'After the first session' },
      ]}
    />
    <section className="toolbar-card drives-toolbar">
      <div className="view-toggle" role="radiogroup" aria-label="Which sessions">
        {[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']].map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={view === key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}
      </div>
    </section>
    {loading && <div className="skeleton-table" aria-busy="true"><div className="skeleton-row"><span className="skeleton-line wide" /></div></div>}
    {!loading && !shown.length && <div className="surface-card empty-state"><span className="empty-art"><FactCheckRounded /></span><h3>{data.sessions.length ? 'No sessions here' : 'No sessions yet'}</h3><p>Create a session for the next drive, training or talk.</p><button type="button" className="primary-button" onClick={() => { setForm(blankForm()); setOpen(true) }}><AddRounded /> New session</button></div>}
    {!loading && shown.length > 0 && <div className="drive-cards">{shown.map(({ session, counts }) => { const day = dateParts(session.date); return <Link key={session.id} to={`/attendance/${session.id}`} className="drive-card-link session-card">
      <span className="date-tile"><strong>{day.day}</strong><span>{day.month}</span></span>
      <span className="drive-card-body">
        <span className="drive-card-top"><strong>{session.title}</strong><span className={`status-badge ${CHECK_IN_CLASS[session.checkIn] || 'upcoming'}`}><i />{CHECK_IN_TEXT[session.checkIn] || session.checkIn}</span></span>
        <span className="drive-card-role">{session.kind}{session.audience === 'applicants' ? ' · applicants only' : session.courses ? ` · ${session.courses}` : ''}</span>
        <span className="drive-card-meta">
          {session.time && <span><ScheduleRounded /> {formatTime(session.time)}</span>}
          {session.venue && <span><PlaceRounded /> {session.venue}</span>}
          <span><CheckRounded /> {counts.present + counts.late} of {counts.expected} present</span>
        </span>
      </span>
    </Link> })}</div>}

    <Modal open={open} onClose={() => setOpen(false)} eyebrow="Attendance" title="New session" description="Students of the chosen courses (or the drive’s applicants) see it in their portal." width="760px">
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className={`form-control full ${errors.driveId ? 'has-error' : ''}`}><span>Placement drive (optional)</span>
            <select id="s-drive" value={form.driveId} onChange={(event) => pickDrive(event.target.value)}>
              <option value="">Not linked to a drive</option>
              {data.drives.filter((drive) => String(drive.driveDate || '') >= today).map((drive) => <option key={drive.id} value={drive.id}>{drive.company} — {drive.role} ({drive.driveDate})</option>)}
            </select>{errors.driveId && <small className="field-error">{errors.driveId}</small>}
          </label>
          <label className={`form-control full ${errors.title ? 'has-error' : ''}`}><span>Title *</span><input id="s-title" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="e.g. Aptitude training — Day 1" />{errors.title && <small className="field-error">{errors.title}</small>}</label>
          <label className="form-control"><span>Type</span><select id="s-kind" value={form.kind} onChange={(event) => set('kind', event.target.value)}>{SESSION_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
          <label className={`form-control ${errors.date ? 'has-error' : ''}`}><span>Date *</span><input id="s-date" type="date" value={form.date} onChange={(event) => set('date', event.target.value)} />{errors.date && <small className="field-error">{errors.date}</small>}</label>
          <label className="form-control"><span>Time</span><input id="s-time" type="time" value={form.time} onChange={(event) => set('time', event.target.value)} /></label>
          <label className="form-control"><span>Venue</span><input id="s-venue" value={form.venue} onChange={(event) => set('venue', event.target.value)} placeholder="e.g. Seminar Hall" /></label>
          <div className="form-control full"><span>Who should attend</span>
            <div className="view-toggle" role="radiogroup" aria-label="Who should attend">
              <button type="button" role="radio" aria-checked={form.audience === 'courses'} className={form.audience === 'courses' ? 'active' : ''} onClick={() => set('audience', 'courses')}>Students of these courses</button>
              <button type="button" role="radio" aria-checked={form.audience === 'applicants'} className={form.audience === 'applicants' ? 'active' : ''} disabled={!form.driveId} onClick={() => set('audience', 'applicants')}>Applicants of the drive</button>
            </div>
          </div>
          {form.audience === 'courses' && <div className={`form-control full ${errors.courses ? 'has-error' : ''}`}><span>Courses *</span>
            <div className="chip-picks" role="group" aria-label="Courses">{DRIVE_COURSES.map((course) => <button key={course} type="button" role="checkbox" aria-checked={form.courses.includes(course)} className={`chip-pick ${form.courses.includes(course) ? 'on' : ''}`} onClick={() => toggleCourse(course)}>{course}</button>)}</div>
            {errors.courses && <small className="field-error">{errors.courses}</small>}
          </div>}
          {form.audience === 'courses' && <label className="form-control full"><span>Batch (optional)</span><input id="s-batches" value={form.batches} onChange={(event) => set('batches', event.target.value)} placeholder="e.g. 2025-27 — leave empty for every batch" /></label>}
          <label className="check-row full"><input type="checkbox" checked={form.announce} onChange={(event) => set('announce', event.target.checked)} /><span>Email the {preview} student{preview === 1 ? '' : 's'} about this session</span></label>
        </div>
        <div className="modal-actions"><button type="button" className="soft-button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><AddRounded /> {saving ? 'Creating…' : 'Create session'}</button></div>
      </form>
    </Modal>
  </div></AppShell>
}
