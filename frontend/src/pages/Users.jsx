import { useCallback, useEffect, useMemo, useState } from 'react'
import { BlockRounded, CheckCircleRounded, DeleteOutlineRounded, HourglassTopRounded, LockRounded, ManageAccountsRounded, PlayCircleOutlineRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { STATUS_LABEL, roleLabel } from '../lib/roles'
import { USERS_CHANGED_EVENT, listUsers, removeUser, updateUser } from '../lib/userAdmin'
import { avatarTone, formatDate, friendlyDateTime, initials } from '../lib/utils'
import { listLoginSessions, logActivity } from '../lib/activity'
import { sessionState } from '../lib/activityRules'

const STATUS_CLASS = { active: 'active', pending: 'in-process', disabled: 'not-eligible' }

export default function Users() {
  const { user: me, isFirebaseConfigured } = useAuth()
  const { push } = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [sessions, setSessions] = useState([])
  useEffect(() => { listLoginSessions().then(setSessions).catch(() => {}) }, [])
  // Newest sign-in per email → "Last active" column
  const lastSession = useMemo(() => {
    const map = new Map()
    sessions.forEach((session) => { const current = map.get(session.email); if (!current || String(session.startedAt) > String(current.startedAt)) map.set(session.email, session) })
    return map
  }, [sessions])

  const load = useCallback(() => listUsers()
    .then((list) => setUsers(list))
    .catch(() => push('Could not load accounts.', 'error'))
    .finally(() => setLoading(false)), [push])

  useEffect(() => {
    load()
    const onStorage = (event) => { if (!event.key || event.key === 'gjimt:lms:local-accounts') load() }
    window.addEventListener(USERS_CHANGED_EVENT, load)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(USERS_CHANGED_EVENT, load); window.removeEventListener('storage', onStorage) }
  }, [load])

  const pending = useMemo(() => users.filter((user) => user.status === 'pending'), [users])
  const counts = useMemo(() => ({
    total: users.length,
    admins: users.filter((user) => user.role === 'admin' && user.status === 'active').length,
    cell: users.filter((user) => user.role === 'placement' && user.status === 'active').length,
    students: users.filter((user) => user.role === 'student').length,
  }), [users])

  const act = async (target, action) => {
    setBusy(target.uid)
    try {
      const log = (text) => logActivity(text, { area: 'Users', category: 'account', detail: `${target.name} · ${target.email}` })
      if (action === 'approve') { await updateUser(target.uid, { status: 'active' }); push(`${target.name} can now sign in as ${roleLabel(target.role)}.`); log(`Approved a ${roleLabel(target.role)} account`) }
      if (action === 'disable') { await updateUser(target.uid, { status: 'disabled' }); push(`${target.name} has been switched off.`, 'info'); log('Switched off an account') }
      if (action === 'enable') { await updateUser(target.uid, { status: 'active' }); push(`${target.name} is switched on again.`); log('Switched an account back on') }
      if (action === 'remove') {
        if (!window.confirm(`Remove ${target.name} (${target.email})? They will no longer be able to sign in.`)) return
        await removeUser(target.uid); push(`${target.name} removed.`, 'info'); log(target.status === 'pending' ? 'Declined an account request' : 'Removed an account')
      }
      if (action.startsWith('role:')) {
        const role = action.slice(5)
        if (role === 'admin' && !window.confirm(`Give ${target.name} full Admin control of every section and user?`)) return
        await updateUser(target.uid, { role }); push(`${target.name} is now ${roleLabel(role)}.`); log(`Changed a role to ${roleLabel(role)}`)
      }
    } catch (error) {
      push(error?.message || 'That change could not be saved.', 'error')
    } finally { setBusy('') }
  }

  const isMe = (target) => target.uid === me?.uid || target.email === me?.email
  const locked = (target) => target.builtIn || isMe(target)

  return <AppShell title="Users & access" subtitle="Administration"><div className="page-stack">
    <PageBanner
      icon={ManageAccountsRounded}
      eyebrow="Administration"
      title="Users & access"
      description="Approve new Placement Cell accounts and decide who can sign in. Admins have full control; the Placement Cell works with drives, attendance and emails; students only see their own portal."
      tiles={[
        { label: 'Accounts', value: loading ? '…' : counts.total, note: isFirebaseConfigured ? 'From Firebase' : 'Built-in + this browser' },
        { label: 'Waiting', value: loading ? '…' : pending.length, note: 'Need your approval' },
        { label: 'Placement Cell', value: loading ? '…' : counts.cell, note: `${counts.admins} admin${counts.admins === 1 ? '' : 's'} active · ${counts.students} student account${counts.students === 1 ? '' : 's'}` },
      ]}
    />

    {pending.length > 0 && <section className="surface-card pending-card" aria-labelledby="pending-title">
      <div className="surface-head"><div><span>Needs your approval</span><h3 id="pending-title">{pending.length} new account{pending.length === 1 ? '' : 's'}</h3></div><HourglassTopRounded /></div>
      <ul className="pending-list">
        {pending.map((target) => <li key={target.uid}>
          <span className={`avatar-chip ${avatarTone(target.name)}`}>{initials(target.name)}</span>
          <div className="pending-who"><strong>{target.name}</strong><small>{target.email} · asked to join as {roleLabel(target.role)}{target.createdAt ? ` · ${formatDate(target.createdAt)}` : ''}</small></div>
          <div className="pending-actions">
            <button type="button" className="soft-button" disabled={busy === target.uid} onClick={() => act(target, 'remove')}><DeleteOutlineRounded /> Decline</button>
            <button type="button" className="primary-button" disabled={busy === target.uid} onClick={() => act(target, 'approve')}><CheckCircleRounded /> Approve</button>
          </div>
        </li>)}
      </ul>
    </section>}

    <section className="table-card">
      <div className="table-card-head"><div><strong>{users.length}</strong> accounts</div><span>Built-in accounts are permanent and can’t be changed here.</span></div>
      <div className="data-table-wrap">
        <table className="data-table users-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last active</th><th>Added</th><th className="action-col">Actions</th></tr></thead>
          <tbody>
            {users.map((target) => <tr key={target.uid} data-email={target.email}>
              <td><span className="cell-identity"><span className={`avatar-chip ${avatarTone(target.name)}`}>{initials(target.name)}</span><strong>{target.name}</strong>{target.builtIn && <em className="built-in-tag"><LockRounded /> Built-in</em>}{target.google && <em className="google-tag" title="Signs in with Continue with Google">Google</em>}{isMe(target) && <em className="you-tag">You</em>}</span></td>
              <td className="nowrap">{target.email}</td>
              <td>{locked(target) || target.role === 'student'
                ? <span className="role-pill">{roleLabel(target.role)}</span>
                : <select className="role-select" aria-label={`Role for ${target.name}`} value={target.role} disabled={busy === target.uid} onChange={(event) => act(target, `role:${event.target.value}`)}>
                  <option value="placement">Placement Cell</option>
                  <option value="admin">Admin</option>
                </select>}
              </td>
              <td><span className={`status-badge ${STATUS_CLASS[target.status] || ''}`}><i />{STATUS_LABEL[target.status] || target.status}</span></td>
              <td className="nowrap">{(() => { const last = lastSession.get(target.email); if (!last) return <span className="muted">Never signed in</span>; const state = sessionState(last); return state.key === 'online' ? <span className="online-pill"><i /> Online now</span> : friendlyDateTime(last.lastSeenAt || last.startedAt) })()}</td>
              <td className="nowrap">{target.createdAt ? formatDate(target.createdAt) : '—'}</td>
              <td className="actions-cell">
                {!locked(target) && target.status === 'pending' && <button type="button" className="table-icon-button" title="Approve" aria-label={`Approve ${target.name}`} onClick={() => act(target, 'approve')}><CheckCircleRounded /></button>}
                {!locked(target) && target.status === 'active' && <button type="button" className="table-icon-button" title="Switch off" aria-label={`Switch off ${target.name}`} onClick={() => act(target, 'disable')}><BlockRounded /></button>}
                {!locked(target) && target.status === 'disabled' && <button type="button" className="table-icon-button" title="Switch on" aria-label={`Switch on ${target.name}`} onClick={() => act(target, 'enable')}><PlayCircleOutlineRounded /></button>}
                {!locked(target) && <button type="button" className="table-icon-button danger" title="Remove" aria-label={`Remove ${target.name}`} onClick={() => act(target, 'remove')}><DeleteOutlineRounded /></button>}
                {locked(target) && <span className="muted-note">—</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    {!isFirebaseConfigured && <p className="page-footnote">Accounts are kept in this browser until Firebase is connected. Built-in passwords can be changed by following the note in <code>frontend/src/config/builtInAccounts.js</code>.</p>}
  </div></AppShell>
}
