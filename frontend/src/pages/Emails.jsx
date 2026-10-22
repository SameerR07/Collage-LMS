import { useCallback, useEffect, useMemo, useState } from 'react'
import { ErrorOutlineRounded, ForwardToInboxRounded, ReplayRounded, SendRounded, VisibilityRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import Modal from '../components/Modal'
import PageBanner from '../components/PageBanner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { DATA_CHANGED_EVENT, listRecords } from '../lib/dataStore'
import { STOP_MESSAGE, getMailStatus } from '../lib/mailClient'
import { OUTBOX, STAFF_ADDRESS, deliverOutbox, outboxCounts, outboxStatus } from '../lib/notify'
import { NOTIFY_KINDS, buildNotifyEmail } from '../lib/notifyEmail'
import { friendlyDateTime } from '../lib/utils'
import { logActivity } from '../lib/activity'

const STATUS_TEXT = { sent: 'Sent', failed: 'Failed', queued: 'Waiting' }
const STATUS_CLASS = { sent: 'active', failed: 'not-eligible', queued: 'in-process' }

/** Every student / Placement Cell email except drive announcements (those are tracked on each drive). */
export default function Emails() {
  const { role } = useAuth()
  const { push } = useToast()
  const [items, setItems] = useState([])
  const [mail, setMail] = useState(null)
  const [filter, setFilter] = useState('all')
  const [kind, setKind] = useState('all')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)

  const load = useCallback(() => Promise.all([listRecords(OUTBOX), getMailStatus()]).then(([list, status]) => {
    setItems(list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))))
    setMail(status)
  }), [])
  useEffect(() => {
    load().catch(() => push('Could not load the email list.', 'error'))
    // Emails sent in the background (e.g. right after sign-in) update the list
    const onChange = (event) => { if (event.detail?.name === OUTBOX) load().catch(() => {}) }
    window.addEventListener(DATA_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange)
  }, [load, push])

  const counts = outboxCounts(items)
  const shown = useMemo(() => items.filter((item) => (filter === 'all' || outboxStatus(item) === filter) && (kind === 'all' || item.kind === kind)), [items, filter, kind])

  const send = async (retryFailed) => {
    setSending(true); setNotice('')
    try {
      const result = await deliverOutbox({ retryFailed })
      if (result.sent || result.failed) logActivity(retryFailed ? 'Retried failed emails' : 'Sent waiting emails', { area: 'Emails', category: 'email', detail: `${result.sent} sent${result.failed ? `, ${result.failed} failed` : ''}` })
      await load()
      if (result.stopped) setNotice(result.message && result.stopped === 'error' ? `${STOP_MESSAGE.error} (${result.message})` : STOP_MESSAGE[result.stopped])
      else push(result.failed ? `${result.sent} sent, ${result.failed} failed.` : `${result.sent} email${result.sent === 1 ? '' : 's'} sent.`, result.failed ? 'info' : 'success')
    } finally { setSending(false) }
  }

  const previewMail = preview ? buildNotifyEmail(preview.kind, preview.data, preview.to?.email === STAFF_ADDRESS ? { name: 'Placement Cell' } : preview.to) : null

  return <AppShell title="Emails" subtitle={role === 'admin' ? 'Workspace' : 'Placement Cell'}><div className="page-stack">
    <PageBanner
      icon={ForwardToInboxRounded}
      eyebrow="Email outbox"
      title="Student emails"
      description="Welcome emails, registration receipts, application updates and session notices. Emails wait here until the email service is set up, then go out."
      actions={<div className="banner-button-row">
        <button type="button" className="primary-button" disabled={sending || !counts.queued} onClick={() => send(false)}><SendRounded /> Send {counts.queued || ''} waiting</button>
        <button type="button" className="soft-button on-dark" disabled={sending || !counts.failed} onClick={() => send(true)}><ReplayRounded /> Retry {counts.failed || ''} failed</button>
      </div>}
      tiles={[
        { label: 'Waiting', value: counts.queued, note: counts.queued ? 'In the queue' : 'Nothing waiting' },
        { label: 'Sent', value: counts.sent, note: `${counts.total} in total` },
        { label: 'Failed', value: counts.failed, note: counts.failed ? 'Can be retried' : 'No failures' },
      ]}
    />
    <p className={`mail-state ${mail?.configured ? 'ready' : 'waiting'}`}><i aria-hidden="true" />{mail === null ? 'Checking the email service…' : mail.configured ? `Email ready — sends as ${mail.from}` : mail.reachable ? 'Email not set up yet — add the sending email and its App Password to env/backend.env' : 'Email service not running here (start the LMS with npm run dev)'}</p>
    {notice && <div className="send-notice" role="status"><ErrorOutlineRounded /><p>{notice}</p></div>}
    <section className="toolbar-card drives-toolbar">
      <div className="view-toggle" role="radiogroup" aria-label="Status">
        {[['all', `All ${counts.total}`], ['queued', `Waiting ${counts.queued}`], ['sent', `Sent ${counts.sent}`], ['failed', `Failed ${counts.failed}`]].map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <label className="filter-select"><select aria-label="Type of email" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">Every type</option>{Object.entries(NOTIFY_KINDS).filter(([, spec]) => !spec.serverOnly).map(([key, spec]) => <option key={key} value={key}>{spec.label}</option>)}</select></label>
    </section>
    <section className="table-card">
      <div className="table-card-head"><div><strong>{shown.length}</strong> email{shown.length === 1 ? '' : 's'}</div><span>Drive announcements are tracked on each drive’s page.</span></div>
      {!shown.length ? <div className="empty-state"><span className="empty-art"><ForwardToInboxRounded /></span><h3>No emails here</h3><p>Emails appear when students sign up, register, apply, or when you update an application or create a session.</p></div>
        : <div className="data-table-wrap"><table className="data-table compact outbox-table">
          <thead><tr><th>When</th><th>Email</th><th>To</th><th>Status</th><th className="action-col">View</th></tr></thead>
          <tbody>{shown.map((item) => <tr key={item.id} data-kind={item.kind} data-status={outboxStatus(item)}>
            <td className="nowrap">{friendlyDateTime(item.createdAt)}</td>
            <td><strong>{NOTIFY_KINDS[item.kind]?.label || item.kind}</strong><small className="sub-line">{item.data?.company || item.data?.title || item.data?.studentName || ''}</small></td>
            <td>{item.to?.email === STAFF_ADDRESS ? 'Placement Cell' : <>{item.to?.name}<small className="sub-line">{item.to?.email}</small></>}</td>
            <td><span className={`status-badge ${STATUS_CLASS[outboxStatus(item)]}`} title={item.error || ''}><i />{STATUS_TEXT[outboxStatus(item)]}</span>{item.error && <small className="log-error">{item.error}</small>}</td>
            <td className="actions-cell"><button type="button" className="table-icon-button" aria-label="Preview this email" title="Preview" onClick={() => setPreview(item)}><VisibilityRounded /></button></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
    <Modal open={Boolean(preview)} onClose={() => setPreview(null)} eyebrow="Email preview" title={previewMail?.subject || ''} description={preview?.to?.email === STAFF_ADDRESS ? 'To: the Placement Cell (PLACEMENT_CELL_EMAIL)' : `To: ${preview?.to?.email || ''}`} width="720px">
      {previewMail && <iframe className="email-preview" title="Email preview" sandbox="" srcDoc={previewMail.html} />}
    </Modal>
  </div></AppShell>
}
