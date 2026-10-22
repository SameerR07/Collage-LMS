import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CampaignRounded, DeleteOutlineRounded, EditRounded, ErrorOutlineRounded, MarkEmailReadRounded, OpenInNewRounded, ReplayRounded,
  ScheduleSendRounded, SendRounded, VisibilityRounded,
} from '@mui/icons-material'
import AppShell from '../components/AppShell'
import ApplicationsPanel from '../components/ApplicationsPanel'
import PageBanner from '../components/PageBanner'
import Modal from '../components/Modal'
import { useToast } from '../context/ToastContext'
import { deleteRecord, listRecords } from '../lib/dataStore'
import { buildDriveEmail, driveSections, emailCounts, formatDriveDate, formatTime, parseCourses, safeUrl, selectRecipients } from '../lib/driveEmail'
import { DRIVES, emailSummaryText, getDrive, isUpcoming, recipientOptions, saveEmailLog } from '../lib/drives'
import { STOP_MESSAGE, deliverDriveEmails, getMailStatus } from '../lib/mailClient'
import { friendlyDateTime } from '../lib/utils'
import { logActivity } from '../lib/activity'

const STATUS_TEXT = { sent: 'Sent', failed: 'Failed', queued: 'Waiting' }
const STATUS_CLASS = { sent: 'active', failed: 'not-eligible', queued: 'in-process' }

export default function DriveDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { push } = useToast()
  const [drive, setDrive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mail, setMail] = useState(null)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [previewOpen, setPreviewOpen] = useState(false)
  const wantsSend = useRef(Boolean(location.state?.send)) // arrived from "Save & email"
  const sendRef = useRef(null)

  useEffect(() => {
    let alive = true
    Promise.all([getDrive(id), getMailStatus()]).then(([found, mailStatus]) => {
      if (!alive) return
      setMail(mailStatus)
      if (!found) { push('That drive no longer exists.', 'error'); navigate('/drives', { replace: true }); return }
      setDrive(found)
      if (wantsSend.current) {
        wantsSend.current = false
        navigate(location.pathname, { replace: true, state: {} }) // a page refresh must not send again
        if (emailCounts(found.emailLog || []).queued) sendRef.current?.({ current: found })
      }
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, navigate, push, location.pathname])

  const log = useMemo(() => drive?.emailLog || [], [drive])
  const counts = emailCounts(log)

  const send = useCallback(async ({ retryFailed = false, current } = {}) => {
    const target = current || drive
    if (!target) return
    setSending(true); setNotice('')
    try {
      const result = await deliverDriveEmails(target, {
        retryFailed,
        save: async (nextLog) => { await saveEmailLog(target.id, nextLog); setDrive((value) => ({ ...value, emailLog: nextLog, emailSummary: emailSummaryText(nextLog) })) },
        onProgress: () => {},
      })
      setDrive((value) => ({ ...value, emailLog: result.log, emailSummary: emailSummaryText(result.log) }))
      if (result.stopped) {
        await saveEmailLog(target.id, result.log)
        setNotice(result.message && result.stopped === 'error' ? `${STOP_MESSAGE.error} (${result.message})` : STOP_MESSAGE[result.stopped])
        setMail(await getMailStatus())
      } else {
        const done = emailCounts(result.log)
        logActivity(`${retryFailed ? 'Retried' : 'Sent'} drive emails — ${target.company}`, { area: 'Placement Drives', category: 'email', detail: `${done.sent} sent${done.failed ? `, ${done.failed} failed` : ''} (of ${done.total} students)` })
        push(done.failed ? `${done.sent} emails sent, ${done.failed} failed — see the list below.` : `All ${done.sent} emails sent.`, done.failed ? 'info' : 'success')
      }
    } finally { setSending(false) }
  }, [drive, push])

  useEffect(() => { sendRef.current = send }, [send])

  /** Never emailed (saved without emailing): queue everyone who matches now. */
  const emailNow = async () => {
    const students = await listRecords('students')
    const { recipients } = selectRecipients(students, recipientOptions(drive))
    if (!recipients.length) { push('No students match this drive’s courses right now.', 'error'); return }
    if (!window.confirm(`Email the ${drive.company} drive details to ${recipients.length} student${recipients.length === 1 ? '' : 's'} now?`)) return
    const nextLog = recipients.map(({ name, email, course }) => ({ name, email, course, status: 'queued' }))
    const next = { ...drive, emailLog: nextLog, emailKind: 'new', emailRequestedAt: new Date().toISOString() }
    await saveEmailLog(drive.id, nextLog)
    setDrive(next)
    send({ current: next })
  }

  const remove = async () => {
    if (!window.confirm(`Delete the ${drive.company} drive? Its details and email list will be removed. This cannot be undone.`)) return
    await deleteRecord(DRIVES, drive.id)
    push('Drive deleted.', 'info')
    navigate('/drives', { replace: true })
  }

  if (loading || !drive) {
    return <AppShell title="Placement drive" subtitle="Placement Drives"><div className="page-stack"><div className="skeleton-table" aria-busy="true" aria-label="Loading drive"><div className="skeleton-row"><span className="skeleton-line wide" /></div><div className="skeleton-row"><span className="skeleton-line" /></div></div></div></AppShell>
  }

  const sections = driveSections(drive)
  const registerUrl = safeUrl(drive.registrationLink)
  const preview = buildDriveEmail(drive, log[0] || { name: 'Student', course: parseCourses(drive.eligible)[0] }, { update: drive.emailKind === 'update' })
  const visibleLog = filter === 'all' ? log : log.filter((entry) => (entry.status || 'queued') === filter)
  const progress = counts.total ? Math.round(((counts.sent + counts.failed) / counts.total) * 100) : 0

  return <AppShell title={drive.company} subtitle="Placement Drives"><div className="page-stack drive-detail-page">
    <PageBanner
      icon={CampaignRounded}
      eyebrow={isUpcoming(drive) ? 'Upcoming placement drive' : 'Past placement drive'}
      title={drive.company}
      description={`${drive.role} · ${drive.ctc} · ${formatDriveDate(drive.driveDate)}${drive.reportingTime ? `, report by ${formatTime(drive.reportingTime)}` : ''}${drive.mode ? ` · ${drive.mode}` : ''}`}
      back={{ to: '/drives', label: 'All drives' }}
      actions={<div className="banner-button-row">
        <Link className="soft-button on-dark" to={`/drives/${drive.id}/edit`}><EditRounded /> Edit</Link>
        <button type="button" className="soft-button on-dark" onClick={() => setPreviewOpen(true)}><VisibilityRounded /> Email preview</button>
        <button type="button" className="soft-button on-dark danger-text" onClick={remove}><DeleteOutlineRounded /> Delete</button>
      </div>}
      tiles={[
        { label: 'Emails sent', value: counts.sent, note: counts.total ? `of ${counts.total} students` : 'Not emailed yet' },
        { label: 'Waiting', value: counts.queued, note: counts.queued ? 'In the queue' : 'Nothing waiting' },
        { label: 'Failed', value: counts.failed, note: counts.failed ? 'Can be retried' : 'No failures' },
      ]}
    />

    <div className="drive-detail-grid">
      <section className="surface-card drive-facts">
        <div className="surface-head"><div><span>Full details</span><h3>{drive.role}</h3></div><span className={`status-badge ${String(drive.status || 'Open').toLowerCase()}`}><i />{drive.status || 'Open'}</span></div>
        {drive.about && <p className="fact-about">{drive.about}</p>}
        {registerUrl && <div className="fact-register">
          <a className="primary-button" href={registerUrl} target="_blank" rel="noopener noreferrer"><OpenInNewRounded /> Registration link</a>
          {drive.applyBy && <span className={isUpcoming({ driveDate: drive.applyBy }) ? '' : 'overdue'}>Register by <strong>{formatDriveDate(drive.applyBy)}</strong></span>}
        </div>}
        {sections.map((section) => <div key={section.key} className="fact-section">
          <h4>{section.title}</h4>
          <dl className="fact-list">
            {section.rows.map(([label, value, kind]) => <div key={label}><dt>{label}</dt><dd>
              {kind === 'link' ? <a className="cell-link" href={value} target="_blank" rel="noopener noreferrer">{value}</a>
                : label === 'Programme(s)' ? <span className="course-chips">{parseCourses(drive.eligible).map((course) => <em key={course}>{course}</em>)}{drive.batches ? <small>batch {drive.batches}</small> : null}</span>
                  : value}
            </dd></div>)}
          </dl>
        </div>)}
        {drive.summary && <div className="fact-summary"><span>Job description (JD)</span><p>{drive.summary}</p></div>}
        {drive.notes && <div className="fact-summary notes"><span>Important notes</span><p>{drive.notes}</p></div>}
        {(drive.applyMarks === 'Yes' && (drive.minTenth || drive.minTwelfth || drive.minGraduation)) || drive.matchSpecialization === 'Yes'
          ? <p className="fact-meta">Emailed only to students who {[drive.applyMarks === 'Yes' && (drive.minTenth || drive.minTwelfth || drive.minGraduation) ? 'meet the minimum marks' : '', drive.matchSpecialization === 'Yes' ? 'have a matching specialization' : ''].filter(Boolean).join(' and ')}.</p> : null}
        <p className="fact-meta">{drive.postedBy || drive.createdBy ? `Posted by ${drive.postedBy || drive.createdBy}` : 'Imported or added by Admin'}{drive.updatedAt ? ` · last changed ${friendlyDateTime(drive.updatedAt)}` : ''}</p>
      </section>

      <section className="surface-card email-panel">
        <div className="surface-head"><div><span>Student emails</span><h3>{counts.total ? `${counts.sent} of ${counts.total} sent` : 'Not emailed yet'}</h3></div><MarkEmailReadRounded /></div>
        {counts.total > 0 && <div className="send-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Emails processed"><span style={{ width: `${progress}%` }} /></div>}
        <p className={`mail-state ${mail?.configured ? 'ready' : 'waiting'}`}><i aria-hidden="true" />{mail === null ? 'Checking the email service…' : mail.configured ? `Email ready — sends as ${mail.from}` : mail.reachable ? 'Email not set up yet (env/backend.env)' : 'Email service not running here'}</p>
        {notice && <div className="send-notice" role="status"><ErrorOutlineRounded /><p>{notice}</p></div>}
        <div className="email-actions">
          {sending && <span className="sending-label"><ScheduleSendRounded /> Sending…</span>}
          {!sending && counts.total === 0 && <button type="button" className="primary-button" onClick={emailNow}><SendRounded /> Email eligible students</button>}
          {!sending && counts.queued > 0 && <button type="button" className="primary-button" onClick={() => send()}><SendRounded /> Send {counts.queued} waiting email{counts.queued === 1 ? '' : 's'}</button>}
          {!sending && counts.failed > 0 && <button type="button" className="soft-button" onClick={() => send({ retryFailed: true })}><ReplayRounded /> Retry {counts.failed} failed</button>}
        </div>
        {counts.total > 0 && <>
          <div className="view-toggle log-filter" role="radiogroup" aria-label="Show">
            {[['all', `All ${counts.total}`], ['sent', `Sent ${counts.sent}`], ['queued', `Waiting ${counts.queued}`], ['failed', `Failed ${counts.failed}`]].map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <div className="email-log">
            <table className="data-table compact">
              <thead><tr><th>Student</th><th>Course</th><th>Email</th><th>Status</th></tr></thead>
              <tbody>{visibleLog.map((entry) => <tr key={entry.email} data-status={entry.status || 'queued'}>
                <td><strong>{entry.name || '—'}</strong></td>
                <td>{entry.course || '—'}</td>
                <td className="nowrap">{entry.email}</td>
                <td><span className={`status-badge ${STATUS_CLASS[entry.status || 'queued']}`} title={entry.error || ''}><i />{STATUS_TEXT[entry.status || 'queued']}</span>{entry.error && <small className="log-error">{entry.error}</small>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
        {drive.emailHistory?.length > 0 && <p className="fact-meta">Earlier emails: {drive.emailHistory.map((item) => `${item.kind === 'update' ? 'update' : 'first email'}${item.at ? ` (${friendlyDateTime(item.at)})` : ''}${item.summary ? ` — ${item.summary}` : ''}`).join('; ')}</p>}
      </section>
    </div>

    <ApplicationsPanel drive={drive} />

    <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} eyebrow="Email preview" title="What students receive" description={`Subject: ${preview.subject}`} width="760px">
      <iframe className="email-preview" title="Email preview" sandbox="" srcDoc={preview.html} />
    </Modal>
  </div></AppShell>
}
