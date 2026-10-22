import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AccessTimeRounded, AddRounded, CampaignRounded, EventAvailableRounded, FileDownloadRounded, FileUploadRounded, GroupsRounded, LanRounded, MailOutlineRounded, PlaceRounded, SearchRounded,
} from '@mui/icons-material'
import AppShell from '../components/AppShell'
import DrivesTable from '../components/DrivesTable'
import ImportDialog from '../components/ImportDialog'
import PageBanner from '../components/PageBanner'
import { entityConfigs } from '../config/modules'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { deleteRecord } from '../lib/dataStore'
import { emailCounts, formatDriveDate, formatTime, parseCourses } from '../lib/driveEmail'
import { DRIVES, exportDrives, isUpcoming, listDrives, sortDrives, todayISO } from '../lib/drives'
import { getMailStatus } from '../lib/mailClient'
import { logActivity } from '../lib/activity'
import { dateParts } from '../lib/utils'

const VIEWS = [['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']]
const LAYOUTS = [['date', 'By date'], ['company', 'By company'], ['table', 'Table']]
const config = entityConfigs.placements

// Small per-browser memory for the chosen view (works without storage too)
const remembered = (key, allowed, fallback) => { try { const value = localStorage.getItem(key); return allowed.includes(value) ? value : fallback } catch { return fallback } }
const remember = (key, value) => { try { localStorage.setItem(key, value) } catch { /* storage unavailable — choice just isn't remembered */ } }

function EmailChip({ drive }) {
  const counts = emailCounts(drive.emailLog || [])
  if (!counts.total) return <span className="mail-chip none"><MailOutlineRounded /> Not emailed</span>
  if (counts.failed) return <span className="mail-chip failed"><MailOutlineRounded /> {counts.sent}/{counts.total} sent · {counts.failed} failed</span>
  if (counts.queued) return <span className="mail-chip waiting"><MailOutlineRounded /> {counts.queued} waiting</span>
  return <span className="mail-chip sent"><MailOutlineRounded /> {counts.sent} emailed</span>
}

export default function Drives() {
  const { role } = useAuth()
  const { push } = useToast()
  const [drives, setDrives] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setViewState] = useState(() => remembered('gjimt:lms:drives:view', VIEWS.map(([key]) => key), 'upcoming'))
  const [layout, setLayoutState] = useState(() => remembered('gjimt:lms:drives:layout', LAYOUTS.map(([key]) => key), 'date'))
  const [columnsView, setColumnsView] = useState(() => remembered('gjimt:lms:view:placements', ['key', 'all'], 'key'))
  const [mail, setMail] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const isAdmin = role === 'admin'
  const setView = (next) => { setViewState(next); remember('gjimt:lms:drives:view', next) }
  const setLayout = (next) => { setLayoutState(next); remember('gjimt:lms:drives:layout', next) }
  const changeColumns = (next) => { setColumnsView(next); remember('gjimt:lms:view:placements', next) }

  const reload = useCallback(() => listDrives().then(setDrives).catch(() => push('Could not load the drives.', 'error')), [push])

  useEffect(() => {
    let alive = true
    Promise.all([listDrives(), getMailStatus()])
      .then(([rows, status]) => { if (alive) { setDrives(rows); setMail(status) } })
      .catch(() => push('Could not load the drives.', 'error'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [push])

  const columns = columnsView === 'key' ? config.keyColumns.map((key) => config.columns.find((column) => column.key === key)).filter(Boolean) : config.columns

  const removeDrive = async (drive) => {
    if (!window.confirm(`Delete the ${drive.company || 'selected'} drive? Its details and email list will be removed. This cannot be undone.`)) return
    try {
      await deleteRecord(DRIVES, drive.id)
      setDrives((current) => current.filter((item) => item.id !== drive.id))
      push('Drive deleted.')
    } catch (error) {
      push(error?.message || 'Could not delete the drive.', 'error')
    }
  }

  const handleImported = (summary) => {
    reload()
    if (!summary || summary.failed) return
    const parts = [summary.created && `${summary.created} added`, summary.updated && `${summary.updated} updated`].filter(Boolean)
    push(parts.length ? `Import complete — ${parts.join(', ')}.` : 'Import complete.')
  }

  const today = todayISO()
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sortDrives(drives, today).filter((drive) => {
      if (view === 'upcoming' && !isUpcoming(drive, today)) return false
      if (view === 'past' && isUpcoming(drive, today)) return false
      return !term || ['company', 'role', 'venue', 'locations', 'eligible', 'ctc', 'mode', 'specialization'].some((key) => String(drive[key] ?? '').toLowerCase().includes(term))
    })
  }, [drives, search, view, today])

  const groups = useMemo(() => {
    const map = new Map()
    shown.forEach((drive) => { const key = String(drive.company || '—').trim(); map.set(key, [...(map.get(key) || []), drive]) })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const totals = useMemo(() => {
    const logs = drives.flatMap((drive) => drive.emailLog || [])
    const counts = emailCounts(logs)
    return {
      upcoming: drives.filter((drive) => isUpcoming(drive, today)).length,
      companies: new Set(drives.map((drive) => String(drive.company || '').trim().toLowerCase()).filter(Boolean)).size,
      sent: counts.sent,
      waiting: counts.queued,
    }
  }, [drives, today])

  const card = (drive) => {
    const day = dateParts(drive.driveDate)
    return <Link key={drive.id} to={`/drives/${drive.id}`} className={`drive-card-link ${isUpcoming(drive, today) ? '' : 'is-past'}`}>
      <span className="date-tile"><strong>{day.day}</strong><span>{day.month}</span></span>
      <span className="drive-card-body">
        <span className="drive-card-top"><strong>{drive.company}</strong><span className={`status-badge ${String(drive.status || 'Open').toLowerCase()}`}><i />{drive.status || 'Open'}</span></span>
        <span className="drive-card-role">{drive.role}{drive.ctc ? <em> · {drive.ctc}</em> : null}</span>
        <span className="drive-card-meta">
          {drive.mode && <span><LanRounded /> {drive.mode}</span>}
          {drive.reportingTime && <span><AccessTimeRounded /> {formatTime(drive.reportingTime)}</span>}
          {drive.venue && <span><PlaceRounded /> {drive.venue}</span>}
          {drive.vacancies && <span><GroupsRounded /> {drive.vacancies}{/^\d+$/.test(String(drive.vacancies).trim()) ? ' vacancies' : ''}</span>}
          {drive.applyBy && <span className={drive.applyBy < today ? 'overdue' : 'deadline'}><EventAvailableRounded /> Register by {formatDriveDate(drive.applyBy, { weekday: false })}</span>}
        </span>
        <span className="drive-card-foot">
          <span className="course-chips">{parseCourses(drive.eligible).map((course) => <em key={course}>{course}</em>)}{!parseCourses(drive.eligible).length && drive.eligible && <em>{drive.eligible}</em>}</span>
          <EmailChip drive={drive} />
        </span>
      </span>
    </Link>
  }

  return <AppShell title="Placement Drives" subtitle={isAdmin ? 'Workspace' : 'Placement Cell'}><div className="page-stack drives-page">
    <PageBanner
      icon={CampaignRounded}
      eyebrow="Placement Drive desk"
      title="Placement drives"
      description="Post a drive once — eligible students get every detail by email, and the full record stays here for each company."
      actions={<div className="banner-button-row">
        <Link className="primary-button" to="/drives/new"><AddRounded /> New drive</Link>
        {isAdmin && <button type="button" className="soft-button on-dark" onClick={() => setImportOpen(true)}><FileUploadRounded /> Import</button>}
        <button type="button" className="soft-button on-dark" disabled={!shown.length} onClick={() => { exportDrives(shown); push('Excel file downloaded.', 'info'); logActivity('Downloaded placement drives Excel', { area: 'Placement Drives', category: 'download', detail: `${shown.length} drive${shown.length === 1 ? '' : 's'}` }) }}><FileDownloadRounded /> Excel</button>
      </div>}
      tiles={[
        { label: 'Upcoming drives', value: loading ? '…' : totals.upcoming, note: `${drives.length} in total` },
        { label: 'Companies', value: loading ? '…' : totals.companies, note: 'With a drive on record' },
        { label: 'Emails sent', value: loading ? '…' : totals.sent, note: totals.waiting ? `${totals.waiting} waiting to send` : 'Nothing waiting' },
      ]}
    />

    {mail && !mail.configured && <section className="setup-callout" role="note">
      <MailOutlineRounded />
      <div><strong>Email isn’t set up yet</strong><p>You can post drives now — their emails wait in a queue and go out once the sending email and its password are added to <code>env/backend.env</code> (see EMAIL_SETUP.md).</p></div>
    </section>}

    <section className="toolbar-card drives-toolbar">
      <label className="toolbar-search"><SearchRounded /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, role, venue, course…" aria-label="Search drives" /></label>
      <div className="view-toggle" role="radiogroup" aria-label="Which drives">
        {VIEWS.map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={view === key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}
      </div>
      <div className="view-toggle" role="radiogroup" aria-label="Layout">
        {LAYOUTS.map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={layout === key} className={layout === key ? 'active' : ''} onClick={() => setLayout(key)}>{label}</button>)}
      </div>
    </section>

    {loading && <div className="skeleton-table" aria-busy="true" aria-label="Loading drives">{[0, 1, 2].map((index) => <div className="skeleton-row" key={index}><span className="skeleton-avatar" /><span className="skeleton-line wide" /><span className="skeleton-pill" /></div>)}</div>}

    {!loading && !shown.length && <div className="surface-card empty-state">
      <span className="empty-art"><CampaignRounded /></span>
      <h3>{drives.length ? 'No drives match' : 'No placement drives yet'}</h3>
      <p>{drives.length ? 'Try another search, or switch between Upcoming, Past and All.' : `Post the first drive — eligible students will get the details by email.${isAdmin ? ' Or import drives from an Excel file.' : ''}`}</p>
      <div className="empty-actions">
        <Link className="primary-button" to="/drives/new"><AddRounded /> New drive</Link>
        {isAdmin && !drives.length && <button type="button" className="soft-button" onClick={() => setImportOpen(true)}><FileUploadRounded /> Import from Excel</button>}
      </div>
    </div>}

    {!loading && shown.length > 0 && layout === 'date' && <div className="drive-cards">{shown.map(card)}</div>}
    {!loading && shown.length > 0 && layout === 'table' && <div className="table-card drives-table-card">
      <div className="table-card-head">
        <div><strong>{shown.length}</strong> {shown.length === 1 ? 'drive' : 'drives'} · {VIEWS.find(([key]) => key === view)[1].toLowerCase()}</div>
        <div className="table-head-tools">
          <span className="scroll-hint">{columns.length > 10 ? `Scroll sideways for all ${columns.length} columns →` : 'Scroll sideways for more →'}</span>
          <div className="view-toggle" role="radiogroup" aria-label="Columns to show">
            <button type="button" role="radio" aria-checked={columnsView === 'key'} className={columnsView === 'key' ? 'active' : ''} onClick={() => changeColumns('key')}>Key columns</button>
            <button type="button" role="radio" aria-checked={columnsView === 'all'} className={columnsView === 'all' ? 'active' : ''} onClick={() => changeColumns('all')}>All columns</button>
          </div>
        </div>
      </div>
      <DrivesTable drives={shown} columns={columns} onDelete={removeDrive} />
      <div className="drive-cards drive-table-fallback">{shown.map(card)}</div>
    </div>}
    {!loading && shown.length > 0 && layout === 'company' && <div className="company-groups">
      {groups.map(([company, list]) => <section key={company} className="company-group">
        <h3>{company} <span>{list.length} drive{list.length === 1 ? '' : 's'}</span></h3>
        <div className="drive-cards">{list.map(card)}</div>
      </section>)}
    </div>}
  </div>
  {isAdmin && <ImportDialog open={importOpen} config={config} existingRows={drives} onClose={() => setImportOpen(false)} onImported={handleImported} />}
  </AppShell>
}
