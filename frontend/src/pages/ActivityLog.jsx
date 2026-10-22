import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  BlockRounded, DownloadRounded, EditNoteRounded, FileDownloadRounded, HistoryRounded, LoginRounded, LogoutRounded, MailOutlineRounded, ManageAccountsRounded, SearchRounded, UploadFileRounded,
} from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { listActivity, listLoginSessions, logActivity } from '../lib/activity'
import { formatDuration, inPeriod, minutesIn, sessionMinutes, sessionState } from '../lib/activityRules'
import { safeSheetName } from '../lib/importer'
import { roleLabel } from '../lib/roles'
import { listUsers } from '../lib/userAdmin'
import { avatarTone, friendlyDateTime, initials } from '../lib/utils'

const ROLES = [['all', 'Everyone'], ['placement', 'Placement Cell'], ['admin', 'Admin'], ['student', 'Students']]
const PERIODS = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Fri, 09 Oct 2026, 10:42 am" (local time) */
const when = (iso) => {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return '—'
  const hours = date.getHours()
  return `${DAYS[date.getDay()]}, ${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`
}
const CATEGORY_ICON = { 'sign-in': LoginRounded, download: DownloadRounded, import: UploadFileRounded, email: MailOutlineRounded, account: ManageAccountsRounded }
const iconFor = (entry) => (entry.action === 'Signed out' ? LogoutRounded : entry.action === 'Sign-in refused' ? BlockRounded : CATEGORY_ICON[entry.category] || EditNoteRounded)

export default function ActivityLog() {
  const { push } = useToast()
  const { isFirebaseConfigured } = useAuth()
  const [data, setData] = useState({ sessions: [], actions: [], accounts: [] })
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [tab, setTab] = useState('sessions')
  const [role, setRole] = useState('all')
  const [person, setPerson] = useState('')
  const [period, setPeriod] = useState('7d')
  const [day, setDay] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(150)

  const load = useCallback(() => Promise.all([listLoginSessions(), listActivity(), listUsers().catch(() => [])]).then(([sessions, actions, accounts]) => {
    setData({
      sessions: sessions.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))),
      actions: actions.sort((a, b) => String(b.at).localeCompare(String(a.at))),
      accounts,
    })
    setNow(new Date())
    setLoading(false)
  }), [])
  useEffect(() => {
    load().catch(() => { push('Could not load the activity log.', 'error'); setLoading(false) })
    const timer = setInterval(() => { load().catch(() => {}) }, 30000) // keeps "Online now" fresh
    return () => clearInterval(timer)
  }, [load, push])

  const activePeriod = day || period
  const term = search.trim().toLowerCase()
  const match = useCallback((entry, at) => (role === 'all' || entry.role === role)
    && (!person || entry.email === person)
    && inPeriod(at, activePeriod, now)
    && (!term || [entry.name, entry.email, entry.action, entry.detail, entry.area, entry.device, entry.lastPage].some((value) => String(value || '').toLowerCase().includes(term))), [role, person, activePeriod, now, term])

  const sessions = useMemo(() => data.sessions.filter((session) => match(session, session.startedAt) || (session.lastSeenAt && match(session, session.lastSeenAt))), [data.sessions, match])
  const actions = useMemo(() => data.actions.filter((entry) => match(entry, entry.at)), [data.actions, match])
  const online = data.sessions.filter((session) => sessionState(session, now).key === 'online')

  // Everyone who appears in the log (for the person filter), staff first
  const people = useMemo(() => {
    const map = new Map()
    ;[...data.accounts.map((account) => ({ email: account.email, name: account.name, role: account.role })), ...data.sessions, ...data.actions].forEach((entry) => { if (entry.email && !map.has(entry.email)) map.set(entry.email, { email: entry.email, name: entry.name || entry.email, role: entry.role }) })
    const order = { admin: 0, placement: 1, student: 2 }
    return [...map.values()].sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || String(a.name).localeCompare(String(b.name)))
  }, [data])

  // Placement Cell + Admin accounts: last seen and today's time
  const team = useMemo(() => data.accounts.filter((account) => ['placement', 'admin'].includes(account.role) && account.status !== 'pending').map((account) => {
    const own = data.sessions.filter((session) => session.email === account.email)
    const latest = own[0]
    return {
      ...account,
      latest,
      state: latest ? sessionState(latest, now) : null,
      today: minutesIn(own, 'today', now),
      actionsToday: data.actions.filter((entry) => entry.email === account.email && inPeriod(entry.at, 'today', now)).length,
    }
  }).sort((a, b) => (a.role === b.role ? 0 : a.role === 'placement' ? -1 : 1)), [data, now])

  const exportExcel = () => {
    const sheetOf = (rows) => { const sheet = XLSX.utils.json_to_sheet(rows); sheet['!cols'] = Object.keys(rows[0] || { A: '' }).map((key) => ({ wch: Math.min(48, Math.max(12, key.length + 2, ...rows.map((row) => String(row[key] ?? '').length + 2))) })); return sheet }
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheetOf(sessions.map((session) => { const state = sessionState(session, now); return { Name: session.name, Email: session.email, Role: roleLabel(session.role), 'Signed in': when(session.startedAt), 'Last active': when(session.lastSeenAt), 'Signed out': session.endedAt ? when(session.endedAt) : state.label, 'Time in LMS': formatDuration(sessionMinutes(session, now)), Device: session.device, 'Last page': session.lastPage } })), safeSheetName('Sign-ins'))
    XLSX.utils.book_append_sheet(book, sheetOf(actions.map((entry) => ({ When: when(entry.at), Name: entry.name, Email: entry.email, Role: roleLabel(entry.role), 'What happened': entry.action, Details: entry.detail, Area: entry.area, Page: entry.page }))), safeSheetName('Actions'))
    XLSX.writeFile(book, `activity-log-${new Date().toLocaleDateString('en-CA')}.xlsx`)
    push('Activity log downloaded.', 'info')
    logActivity('Downloaded the activity log', { area: 'Activity log', category: 'download', detail: `${sessions.length} sign-ins, ${actions.length} actions` })
  }

  const periodNote = day ? `on ${day}` : PERIODS.find(([key]) => key === period)[1].toLowerCase()
  return <AppShell title="Activity log" subtitle="Administration"><div className="page-stack activity-page">
    <PageBanner
      icon={HistoryRounded}
      eyebrow="Administration"
      title="Activity log"
      description="Who signed in and when, how long they were working, and what they did — Placement Cell, Admin and students. Only the Admin can see this page."
      actions={<div className="banner-button-row"><button type="button" className="soft-button on-dark" onClick={exportExcel} disabled={loading}><FileDownloadRounded /> Excel</button></div>}
      tiles={[
        { label: 'Online now', value: loading ? '…' : online.length, note: online.length ? online.map((session) => session.name || session.email).slice(0, 3).join(', ') : 'Nobody right now' },
        { label: 'Sign-ins', value: loading ? '…' : sessions.length, note: periodNote },
        { label: 'Actions', value: loading ? '…' : actions.length, note: periodNote },
      ]}
    />

    {team.length > 0 && <section className="team-strip" aria-label="Placement Cell and Admin">
      {team.map((member) => <button key={member.uid || member.email} type="button" className={`team-card ${person === member.email ? 'on' : ''}`} onClick={() => setPerson(person === member.email ? '' : member.email)} aria-pressed={person === member.email} data-email={member.email}>
        <span className={`avatar-chip ${avatarTone(member.name)}`}>{initials(member.name)}</span>
        <span className="team-text">
          <strong>{member.name}</strong>
          <small>{roleLabel(member.role)}{member.builtIn ? ' · built-in' : ''}</small>
          <span className={`team-state ${member.state?.key || 'never'}`}><i />{!member.state ? 'Never signed in' : member.state.key === 'online' ? 'Online now' : `Last active ${friendlyDateTime(member.latest.lastSeenAt || member.latest.startedAt)}`}</span>
          <small>Today: {member.today ? formatDuration(member.today) : 'not signed in'}{member.actionsToday ? ` · ${member.actionsToday} action${member.actionsToday === 1 ? '' : 's'}` : ''}</small>
        </span>
      </button>)}
    </section>}

    <section className="toolbar-card activity-toolbar">
      <div className="view-toggle" role="radiogroup" aria-label="Show">
        <button type="button" role="radio" aria-checked={tab === 'sessions'} className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Sign-ins {sessions.length}</button>
        <button type="button" role="radio" aria-checked={tab === 'actions'} className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>Actions {actions.length}</button>
      </div>
      <div className="view-toggle" role="radiogroup" aria-label="Role">
        {ROLES.map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={role === key} className={role === key ? 'active' : ''} onClick={() => setRole(key)}>{label}</button>)}
      </div>
      <label className="filter-select"><select aria-label="Person" value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Every person</option>{people.map((entry) => <option key={entry.email} value={entry.email}>{entry.name}{entry.role ? ` (${roleLabel(entry.role)})` : ''}</option>)}</select></label>
      <label className="filter-select"><select aria-label="Period" value={day ? 'day' : period} onChange={(event) => { if (event.target.value === 'day') setDay(new Date().toLocaleDateString('en-CA')); else { setDay(''); setPeriod(event.target.value) } }}>{PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="day">One day…</option></select></label>
      {day && <input className="date-pick" type="date" aria-label="Day" value={day} max={new Date().toLocaleDateString('en-CA')} onChange={(event) => setDay(event.target.value)} />}
      <label className="toolbar-search small"><SearchRounded /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, action…" aria-label="Search the log" /></label>
    </section>

    {tab === 'sessions' && <section className="table-card">
      <div className="table-card-head"><div><strong>{sessions.length}</strong> sign-in{sessions.length === 1 ? '' : 's'} · {periodNote}</div><span>“Last active” updates every minute while someone is using the LMS.</span></div>
      {loading ? <div className="skeleton-table" aria-busy="true"><div className="skeleton-row"><span className="skeleton-line wide" /></div></div>
        : !sessions.length ? <div className="empty-state"><span className="empty-art"><LoginRounded /></span><h3>No sign-ins here</h3><p>Try another period, role or person.</p></div>
          : <div className="data-table-wrap"><table className="data-table compact sessions-table">
            <thead><tr><th>Person</th><th>Role</th><th>Signed in</th><th>Last active</th><th>Signed out</th><th>Time in LMS</th><th>Device</th><th>Last page</th></tr></thead>
            <tbody>{sessions.slice(0, limit).map((session) => { const state = sessionState(session, now); return <tr key={session.id} data-email={session.email} data-state={state.key}>
              <td><strong>{session.name || '—'}</strong><small className="sub-line">{session.email}</small></td>
              <td><span className={`role-tag ${session.role}`}>{roleLabel(session.role)}</span></td>
              <td className="nowrap">{when(session.startedAt)}{session.resumed === 'Yes' && <small className="sub-line">already signed in</small>}</td>
              <td className="nowrap">{friendlyDateTime(session.lastSeenAt)}</td>
              <td className="nowrap">{state.key === 'online' ? <span className="online-pill"><i /> Online now</span> : state.key === 'ended' ? when(session.endedAt) : <span className="muted">{state.label}</span>}</td>
              <td className="nowrap">{formatDuration(sessionMinutes(session, now))}</td>
              <td className="nowrap muted-cell">{session.device || '—'}</td>
              <td className="muted-cell">{session.lastPage || '—'}</td>
            </tr> })}</tbody>
          </table></div>}
      {sessions.length > limit && <div className="load-more"><button type="button" className="soft-button" onClick={() => setLimit((value) => value + 150)}>Show more</button></div>}
    </section>}

    {tab === 'actions' && <section className="table-card">
      <div className="table-card-head"><div><strong>{actions.length}</strong> action{actions.length === 1 ? '' : 's'} · {periodNote}</div><span>Adds, edits, deletes, imports, emails, downloads and sign-ins.</span></div>
      {loading ? <div className="skeleton-table" aria-busy="true"><div className="skeleton-row"><span className="skeleton-line wide" /></div></div>
        : !actions.length ? <div className="empty-state"><span className="empty-art"><EditNoteRounded /></span><h3>Nothing recorded here</h3><p>Try another period, role or person.</p></div>
          : <div className="data-table-wrap"><table className="data-table compact actions-table">
            <thead><tr><th>When</th><th>Person</th><th>What happened</th><th>Area</th></tr></thead>
            <tbody>{actions.slice(0, limit).map((entry) => { const Icon = iconFor(entry); return <tr key={entry.id} data-email={entry.email} data-category={entry.category}>
              <td className="nowrap">{when(entry.at)}</td>
              <td><strong>{entry.name || entry.email}</strong><small className="sub-line">{roleLabel(entry.role)}{entry.name ? ` · ${entry.email}` : ''}</small></td>
              <td><span className={`action-line ${entry.action === 'Sign-in refused' ? 'refused' : ''}`}><Icon /> <span><strong>{entry.action}</strong>{entry.detail && <small className="sub-line">{entry.detail}</small>}</span></span></td>
              <td className="muted-cell">{entry.area || entry.page || '—'}</td>
            </tr> })}</tbody>
          </table></div>}
      {actions.length > limit && <div className="load-more"><button type="button" className="soft-button" onClick={() => setLimit((value) => value + 150)}>Show more</button></div>}
    </section>}
    <p className="page-footnote">{isFirebaseConfigured ? 'Stored in Firebase; only Admins can read it.' : 'Kept in this browser until Firebase is connected (the newest 5,000 actions and 2,000 sign-ins).'} Students’ sign-ins are recorded too — use the role filter.</p>
  </div></AppShell>
}
