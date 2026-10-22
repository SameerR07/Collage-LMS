import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AccessTimeRounded, CampaignRounded, CheckCircleRounded, EventAvailableRounded, ExpandLessRounded, ExpandMoreRounded,
  InfoOutlined, LanRounded, OpenInNewRounded, PlaceRounded, SendRounded, UndoRounded,
} from '@mui/icons-material'
import AppShell from '../../components/AppShell'
import Modal from '../../components/Modal'
import PageBanner from '../../components/PageBanner'
import StudentGate from '../../components/StudentGate'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { driveSections, formatDriveDate, formatTime, parseCourses, safeUrl } from '../../lib/driveEmail'
import { listDrives, sortDrives, todayISO } from '../../lib/drives'
import { applyForDrive, listMyApplications, withdrawApplication } from '../../lib/studentPortal'
import { canWithdraw, driveEligibility, isActiveApplication } from '../../lib/studentRules'
import { dateParts, statusClass } from '../../lib/utils'

const TABS = [['open', 'Open for you'], ['applied', 'My applications'], ['all', 'All drives']]

function DriveCard({ drive, check, application, onApply, onWithdraw, busy }) {
  const [open, setOpen] = useState(false)
  const day = dateParts(drive.driveDate)
  const register = safeUrl(drive.registrationLink)
  const active = isActiveApplication(application)
  return <article className={`sp-drive ${active ? 'is-applied' : ''} ${!check.eligible || check.closedReason ? 'is-muted' : ''}`} data-company={drive.company}>
    <div className="sp-drive-main">
      <span className="date-tile"><strong>{day.day}</strong><span>{day.month}</span></span>
      <div className="sp-drive-body">
        <div className="sp-drive-top">
          <strong>{drive.company}</strong>
          {application
            ? <span className={`status-badge ${statusClass(application.status)}`}><i />{application.status}</span>
            : check.canApply ? <span className="status-badge eligible"><i />You can apply</span>
              : check.eligible ? <span className="status-badge closed"><i />Closed</span>
                : <span className="status-badge not-eligible"><i />Not eligible</span>}
        </div>
        <span className="sp-drive-role">{drive.role}{drive.ctc ? <em> · {drive.ctc}</em> : null}</span>
        <span className="drive-card-meta">
          {drive.mode && <span><LanRounded /> {drive.mode}</span>}
          {drive.reportingTime && <span><AccessTimeRounded /> {formatTime(drive.reportingTime)}</span>}
          {drive.venue && <span><PlaceRounded /> {drive.venue}</span>}
          {drive.applyBy && <span className={drive.applyBy < todayISO() ? 'overdue' : 'deadline'}><EventAvailableRounded /> Apply by {formatDriveDate(drive.applyBy, { weekday: false })}</span>}
        </span>
        {!check.eligible && check.reasons.length > 0 && <ul className="sp-reasons">{check.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        {check.eligible && check.closedReason && !active && <p className="sp-reasons-note">{check.closedReason}</p>}
        {active && application.note && <p className="sp-note"><InfoOutlined /> {application.note}</p>}
        {active && application.roundsCleared && <p className="sp-note"><CheckCircleRounded /> Rounds cleared: {application.roundsCleared}{drive.roundsCount ? ` of ${drive.roundsCount}` : ''}</p>}
      </div>
    </div>
    <div className="sp-drive-actions">
      <button type="button" className="soft-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? <ExpandLessRounded /> : <ExpandMoreRounded />} {open ? 'Hide details' : 'Details'}</button>
      {register && <a className="soft-button" href={register} target="_blank" rel="noopener noreferrer"><OpenInNewRounded /> Company registration</a>}
      {!active && check.canApply && <button type="button" className="primary-button" disabled={busy} onClick={() => onApply(drive)}><SendRounded /> {application ? 'Apply again' : 'Apply'}</button>}
      {active && canWithdraw(application) && <button type="button" className="soft-button danger-text" disabled={busy} onClick={() => onWithdraw(application)}><UndoRounded /> Withdraw</button>}
    </div>
    {open && <div className="sp-drive-details">
      {drive.about && <p className="fact-about">{drive.about}</p>}
      {driveSections(drive).map((section) => <div key={section.key} className="fact-section">
        <h4>{section.title}</h4>
        <dl className="fact-list">{section.rows.map(([label, value, kind]) => <div key={label}><dt>{label}</dt><dd>{kind === 'link' ? <a className="cell-link" href={value} target="_blank" rel="noopener noreferrer">{value}</a> : value}</dd></div>)}</dl>
      </div>)}
      {drive.summary && <div className="fact-summary"><span>Job description (JD)</span><p>{drive.summary}</p></div>}
      {drive.notes && <div className="fact-summary notes"><span>Important notes</span><p>{drive.notes}</p></div>}
    </div>}
  </article>
}

function DrivesView({ record }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [drives, setDrives] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [applying, setApplying] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => Promise.all([listDrives(), listMyApplications(user.email)])
    .then(([driveList, mine]) => { setDrives(sortDrives(driveList)); setApplications(mine); setLoading(false) }), [user.email])
  useEffect(() => { load().catch(() => { push('Could not load the drives.', 'error'); setLoading(false) }) }, [load, push])

  const today = todayISO()
  const rows = useMemo(() => {
    const byDrive = new Map(applications.map((application) => [application.driveId, application]))
    return drives.map((drive) => ({ drive, check: driveEligibility(drive, record, today), application: byDrive.get(drive.id) }))
  }, [drives, applications, record, today])
  const openRows = rows.filter((row) => row.check.canApply && !isActiveApplication(row.application))
  const appliedRows = rows.filter((row) => row.application).sort((a, b) => String(b.application.appliedAt || '').localeCompare(String(a.application.appliedAt || '')))
  const allRows = rows.filter((row) => String(row.drive.driveDate || '') >= today || row.application)
  const shown = tab === 'open' ? openRows : tab === 'applied' ? appliedRows : allRows

  const apply = async () => {
    setBusy(true)
    try {
      await applyForDrive(user, record, applying)
      push(`Applied for ${applying.company}. A confirmation email is on its way.`)
      setApplying(null); setConfirmed(false); setTab('applied')
      await load()
    } catch (error) {
      push(error?.message || 'Your application could not be sent.', 'error')
    } finally { setBusy(false) }
  }

  const withdraw = async (application) => {
    if (!window.confirm(`Withdraw your application for ${application.company}?`)) return
    setBusy(true)
    try { await withdrawApplication(application); push('Application withdrawn.', 'info'); await load() }
    catch (error) { push(error?.message || 'Could not withdraw.', 'error') }
    finally { setBusy(false) }
  }

  const selected = appliedRows.filter((row) => row.application.status === 'Selected').length
  return <>
    <PageBanner
      icon={CampaignRounded}
      eyebrow="Student portal"
      title="Apply for placement"
      description={`Drives for ${record.course}${record.batch ? ` · batch ${record.batch}` : ''}. You can apply when your course, batch, marks and status match the company’s rules.`}
      tiles={[
        { label: 'Open for you', value: loading ? '…' : openRows.length, note: 'Not applied yet' },
        { label: 'Applied', value: loading ? '…' : appliedRows.filter((row) => isActiveApplication(row.application)).length, note: selected ? `${selected} selected` : 'Active applications' },
        { label: 'Placement status', value: record.placementStatus || '—', note: record.company || 'From the Placement Cell' },
      ]}
    />
    <section className="toolbar-card drives-toolbar">
      <div className="view-toggle" role="radiogroup" aria-label="Show">
        {TABS.map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}{key === 'open' && openRows.length ? ` ${openRows.length}` : ''}</button>)}
      </div>
    </section>
    {loading && <div className="skeleton-table" aria-busy="true" aria-label="Loading drives"><div className="skeleton-row"><span className="skeleton-line wide" /></div></div>}
    {!loading && !shown.length && <div className="surface-card empty-state">
      <span className="empty-art"><CampaignRounded /></span>
      <h3>{tab === 'applied' ? 'No applications yet' : tab === 'open' ? 'No drives open for you right now' : 'No upcoming drives'}</h3>
      <p>{tab === 'open' ? 'New drives for your course appear here and reach you by email.' : tab === 'applied' ? 'Apply from “Open for you”.' : 'Check back soon.'}</p>
    </div>}
    {!loading && shown.length > 0 && <div className="sp-drive-list">{shown.map((row) => <DriveCard key={row.drive.id} {...row} busy={busy} onApply={(drive) => { setApplying(drive); setConfirmed(false) }} onWithdraw={withdraw} />)}</div>}

    <Modal open={Boolean(applying)} onClose={() => setApplying(null)} eyebrow="Apply for placement" title={applying ? `${applying.company} — ${applying.role}` : ''} description="These details go to the Placement Cell with your application." width="620px">
      {applying && <div className="apply-review">
        <dl className="fact-list compact-facts">
          <div><dt>Name</dt><dd>{record.name}</dd></div>
          <div><dt>Uni. Roll No.</dt><dd>{record.rollNo}</dd></div>
          <div><dt>Course</dt><dd>{record.course}{record.batch ? ` · ${record.batch}` : ''}</dd></div>
          <div><dt>Phone</dt><dd>{record.phone || '—'}</dd></div>
          <div><dt>Marks (X / XII / Grad.)</dt><dd>{[record.tenthPercent, record.twelfthPercent, record.graduationPercent].map((value) => (value ? `${value}%` : '—')).join(' / ')}</dd></div>
        </dl>
        {safeUrl(applying.registrationLink) && <div className="setup-callout info"><InfoOutlined /><div><strong>The company also needs you to register on its site</strong><p><a className="cell-link" href={safeUrl(applying.registrationLink)} target="_blank" rel="noopener noreferrer">Open the company registration</a>{applying.applyBy ? ` — by ${formatDriveDate(applying.applyBy)}` : ''}.</p></div></div>}
        <p className="muted-copy">Drive on {formatDriveDate(applying.driveDate)}{applying.reportingTime ? `, report by ${formatTime(applying.reportingTime)}` : ''}{applying.venue ? ` · ${applying.venue}` : ''}. For: {parseCourses(applying.eligible).join(', ')}.</p>
        <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>My details are correct and I will attend the drive if shortlisted.</span></label>
        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={() => setApplying(null)}>Cancel</button>
          <button type="button" className="primary-button" disabled={!confirmed || busy} onClick={apply}><SendRounded /> {busy ? 'Applying…' : 'Confirm application'}</button>
        </div>
      </div>}
    </Modal>
  </>
}

export default function StudentDrives() {
  return <AppShell title="Apply for Placement" subtitle="Student portal"><div className="page-stack">
    <StudentGate>{({ record }) => <DrivesView record={record} />}</StudentGate>
  </div></AppShell>
}
