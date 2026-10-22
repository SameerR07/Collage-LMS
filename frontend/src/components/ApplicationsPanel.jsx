import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { ChatBubbleOutlineRounded, FileDownloadRounded, GroupsRounded, SearchRounded } from '@mui/icons-material'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDriveDate } from '../lib/driveEmail'
import { safeSheetName } from '../lib/importer'
import { logActivity } from '../lib/activity'
import { listDriveApplications, setApplicationStatus } from '../lib/studentPortal'
import { APPLICATION_STATUSES } from '../lib/studentRules'
import { friendlyDateTime, statusClass } from '../lib/utils'

const FILTERS = ['All', ...APPLICATION_STATUSES]

/** Placement Cell / Admin: students who applied for this drive from the student portal. */
export default function ApplicationsPanel({ drive }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [notify, setNotify] = useState(true)
  const [picked, setPicked] = useState([])
  const [bulkStatus, setBulkStatus] = useState('Shortlisted')
  const [noteFor, setNoteFor] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const by = user?.displayName || user?.email || 'Placement Cell'
  const rounds = Math.max(0, Number(drive.roundsCount) || 0)

  const load = useCallback(() => listDriveApplications(drive.id)
    .then((list) => setItems(list.sort((a, b) => String(a.appliedAt || '').localeCompare(String(b.appliedAt || '')))))
    .catch(() => push('Could not load the applications.', 'error'))
    .finally(() => setLoading(false)), [drive.id, push])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((status) => [status, status === 'All' ? items.length : items.filter((item) => item.status === status).length])), [items])
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => (filter === 'All' || item.status === filter) && (!term || [item.name, item.rollNo, item.studentEmail, item.course].some((value) => String(value || '').toLowerCase().includes(term))))
  }, [items, filter, search])

  const save = async (item, changes, message) => {
    setBusy(true)
    try {
      const updated = await setApplicationStatus(item, changes, { by, notify, drive })
      setItems((current) => current.map((entry) => (entry.id === item.id ? updated : entry)))
      if (message) push(message)
      return updated
    } catch (error) {
      push(error?.message || 'Could not update the application.', 'error')
      return null
    } finally { setBusy(false) }
  }

  const changeStatus = (item, status) => {
    if (status === 'Selected' && !window.confirm(`Mark ${item.name} as Selected? Their Master Data status becomes “Placed” at ${drive.company}.`)) return
    save(item, { status }, `${item.name}: ${status}${notify ? ' — email queued' : ''}`)
  }

  const applyBulk = async () => {
    const targets = items.filter((item) => picked.includes(item.id) && item.status !== bulkStatus)
    if (!targets.length) return
    if (!window.confirm(`Set ${targets.length} application${targets.length === 1 ? '' : 's'} to “${bulkStatus}”?${notify ? ' Each student gets an email.' : ''}`)) return
    setBusy(true)
    try {
      for (const item of targets) {
        const updated = await setApplicationStatus(item, { status: bulkStatus }, { by, notify, drive })
        setItems((current) => current.map((entry) => (entry.id === item.id ? updated : entry)))
      }
      push(`${targets.length} application${targets.length === 1 ? '' : 's'} set to ${bulkStatus}.`)
      setPicked([])
    } catch (error) {
      push(error?.message || 'Some applications could not be updated.', 'error')
    } finally { setBusy(false) }
  }

  const exportExcel = () => {
    const rows = shown.map((item, index) => ({
      'S.No.': index + 1, Name: item.name, 'Uni. Roll No.': item.rollNo, Course: item.course, Batch: item.batch, Email: item.studentEmail, Phone: item.phone,
      Specialization: item.specialization, '10th %': item.tenthPercent, '12th %': item.twelfthPercent, 'Graduation %': item.graduationPercent, CGPA: item.cgpa,
      Status: item.status, 'Rounds cleared': item.roundsCleared, Note: item.note, 'Applied on': item.appliedAt ? item.appliedAt.slice(0, 10) : '', 'Self-registered': item.selfRegistered,
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = Object.keys(rows[0] || { Name: '' }).map((key) => ({ wch: Math.min(40, Math.max(10, key.length + 2, ...rows.map((row) => String(row[key] ?? '').length + 2))) }))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, safeSheetName(`${drive.company} applicants`))
    XLSX.writeFile(book, `${String(drive.company).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-applicants-${drive.driveDate || ''}.xlsx`)
    push('Applicant list downloaded.', 'info')
    logActivity(`Downloaded the ${drive.company} applicant list`, { area: 'Applications', category: 'download', detail: `${shown.length} applicant${shown.length === 1 ? '' : 's'}` })
  }

  const allPicked = shown.length > 0 && shown.every((item) => picked.includes(item.id))
  return <section className="surface-card applications-panel" id="applications">
    <div className="surface-head"><div><span>Student portal</span><h3>{items.length ? `${items.length} application${items.length === 1 ? '' : 's'}` : 'Applications'}</h3></div><GroupsRounded /></div>
    {loading ? <p className="muted-copy">Loading applications…</p> : !items.length ? <p className="muted-copy">No student has applied from the student portal yet. Eligible students see this drive under “Apply for Placement”.</p> : <>
      <div className="app-toolbar">
        <div className="view-toggle wrap" role="radiogroup" aria-label="Filter applications">
          {FILTERS.map((status) => <button key={status} type="button" role="radio" aria-checked={filter === status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>{status} {counts[status]}</button>)}
        </div>
        <label className="toolbar-search small"><SearchRounded /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, roll no…" aria-label="Search applicants" /></label>
      </div>
      <div className="app-toolbar">
        <label className="check-row inline"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} /><span>Email students when I change their status or add a message</span></label>
        <div className="app-bulk">
          <span>{picked.length} picked</span>
          <select aria-label="Status for picked applications" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>{APPLICATION_STATUSES.filter((status) => status !== 'Withdrawn').map((status) => <option key={status}>{status}</option>)}</select>
          <button type="button" className="soft-button" disabled={!picked.length || busy} onClick={applyBulk}>Set status</button>
          <button type="button" className="soft-button" onClick={exportExcel} disabled={!shown.length}><FileDownloadRounded /> Excel</button>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table compact applications-table">
          <thead><tr>
            <th><input type="checkbox" aria-label="Pick all shown" checked={allPicked} onChange={(event) => setPicked(event.target.checked ? shown.map((item) => item.id) : [])} /></th>
            <th>Student</th><th>Course</th><th>Phone</th><th>Marks X / XII / Grad.</th><th>Applied</th><th>Rounds cleared</th><th>Status</th><th className="action-col">Message</th>
          </tr></thead>
          <tbody>{shown.map((item) => <tr key={item.id} data-email={item.studentEmail} className={item.status === 'Withdrawn' ? 'is-withdrawn' : ''}>
            <td><input type="checkbox" aria-label={`Pick ${item.name}`} checked={picked.includes(item.id)} onChange={(event) => setPicked((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))} /></td>
            <td><strong>{item.name}</strong><small className="sub-line">{item.rollNo} · {item.studentEmail}{item.selfRegistered === 'Yes' ? ' · self-registered' : ''}</small></td>
            <td className="nowrap">{item.course}{item.batch ? ` · ${item.batch}` : ''}</td>
            <td className="nowrap">{item.phone || '—'}</td>
            <td className="nowrap">{[item.tenthPercent, item.twelfthPercent, item.graduationPercent].map((value) => value || '—').join(' / ')}</td>
            <td className="nowrap" title={item.appliedAt}>{item.appliedAt ? friendlyDateTime(item.appliedAt) : '—'}</td>
            <td>{rounds > 0
              ? <select className="mini-select" aria-label={`Rounds cleared by ${item.name}`} value={item.roundsCleared || ''} disabled={busy || item.status === 'Withdrawn'} onChange={(event) => save(item, { roundsCleared: event.target.value }, `${item.name}: ${event.target.value || 0} round(s) cleared`)}>
                <option value="">—</option>{Array.from({ length: rounds }, (_, index) => String(index + 1)).map((value) => <option key={value} value={value}>{value} of {rounds}</option>)}
              </select>
              : <span className="muted">—</span>}</td>
            <td>{item.status === 'Withdrawn'
              ? <span className="status-badge withdrawn"><i />Withdrawn</span>
              : <select className={`mini-select status-select ${statusClass(item.status)}`} aria-label={`Status of ${item.name}`} value={item.status} disabled={busy} onChange={(event) => changeStatus(item, event.target.value)}>
                {APPLICATION_STATUSES.filter((status) => status !== 'Withdrawn').map((status) => <option key={status}>{status}</option>)}
              </select>}</td>
            <td className="actions-cell"><button type="button" className="table-icon-button" title={item.note ? `Message: ${item.note}` : 'Send a message'} aria-label={`Message to ${item.name}`} onClick={() => { setNoteFor(item); setNote(item.note || '') }}><ChatBubbleOutlineRounded /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="fact-meta">Drive on {formatDriveDate(drive.driveDate)}. “Selected” also marks the student as Placed at {drive.company} in Master Data.</p>
    </>}
    <Modal open={Boolean(noteFor)} onClose={() => setNoteFor(null)} eyebrow="Message to student" title={noteFor?.name || ''} description="Shown on the student’s application and, if emails are on, sent to them." width="560px">
      <form onSubmit={async (event) => { event.preventDefault(); if (await save(noteFor, { note: note.trim() }, 'Message saved.')) setNoteFor(null) }}>
        <label className="form-control full"><span>Message</span><textarea rows={4} maxLength={600} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Interview at 11:30 AM in Room 204 — bring two copies of your resume." /></label>
        <div className="modal-actions"><button type="button" className="soft-button" onClick={() => setNoteFor(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>Save message</button></div>
      </form>
    </Modal>
  </section>
}
