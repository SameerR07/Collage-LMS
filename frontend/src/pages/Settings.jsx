import { Link } from 'react-router-dom'
import { BadgeRounded, DarkModeRounded, DeleteSweepRounded, SettingsRounded, ShieldRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { resetLocalData } from '../lib/dataStore'
import { logActivity } from '../lib/activity'
import { homeFor, roleLabel } from '../lib/roles'
import { firstName } from '../lib/utils'

const ROLE_RIGHTS = {
  admin: 'Full control: every section, every record, and who can sign in.',
  placement: 'Placement Drive desk, attendance sessions and the email outbox: post drives, manage applications and take attendance.',
  student: 'Student portal: your registration, applying for placement drives and your attendance.',
}

export default function Settings() {
  const { user, role, isFirebaseConfigured } = useAuth(); const { theme, toggleTheme } = useTheme(); const { push } = useToast()
  const isAdmin = role === 'admin'
  const reset = () => { if (!window.confirm('Reset the sample records kept in this browser? Cloud Firebase records are not deleted by this button.')) return; logActivity('Reset the sample data in this browser', { area: 'Settings' }); resetLocalData(); push('Local sample data reset. Open a section to recreate sample rows.', 'info') }
  return <AppShell title="Settings" subtitle="Account & preferences"><div className="page-stack settings-page">
    <PageBanner
      icon={SettingsRounded}
      eyebrow="Personal workspace"
      title="Profile & Settings"
      description="Your account, your access and how the LMS looks."
      back={{ to: homeFor(role), label: isAdmin ? 'Dashboard' : role === 'student' ? 'My Portal' : 'Placement Drives' }}
      tiles={[
        { label: 'Role', value: roleLabel(role), note: user?.builtIn ? 'Built-in account' : role === 'student' ? (user?.emailVerified ? 'Email verified' : 'Student account') : 'Approved by Admin' },
        { label: 'Theme', value: theme === 'light' ? 'Light' : 'Dark', note: 'Switch any time below' },
        { label: 'Accounts kept in', value: isFirebaseConfigured ? 'Cloud' : 'This browser', note: isFirebaseConfigured ? 'Firebase connected' : 'Until Firebase is connected' },
      ]}
    />
    <div className="settings-grid">
      <section className="surface-card profile-card-wide">
        <div className="profile-banner"><div className="big-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : firstName(user).charAt(0).toUpperCase()}</div><div><span>Signed in as</span><h3>{user?.displayName || roleLabel(role)}</h3><p>{user?.email}</p></div></div>
        <div className="setting-row"><div><strong>Access</strong><p>{ROLE_RIGHTS[role] || '—'}</p></div><span className="connection-pill connected"><i />{roleLabel(role)}</span></div>
        <div className="setting-row"><div><strong>Sign-in</strong><p>{isFirebaseConfigured ? 'Firebase Authentication is connected.' : 'Accounts are checked in this browser until Firebase is connected.'}</p></div><BadgeRounded /></div>
      </section>
      <section className="surface-card settings-list"><div className="surface-head"><div><span>Preferences</span><h3>Interface</h3></div><DarkModeRounded /></div><button className="preference-row" onClick={toggleTheme}><div><strong>Theme</strong><small>Switch between light and dark mode.</small></div><span className="preference-value">{theme === 'light' ? 'Light' : 'Dark'}</span></button></section>
      {isAdmin && <section className="surface-card settings-list"><div className="surface-head"><div><span>Admin tools</span><h3>Data &amp; people</h3></div><DeleteSweepRounded /></div><Link to="/users" className="preference-row"><div><strong>Users &amp; access</strong><small>Approve Placement Cell accounts, switch accounts off.</small></div><span className="preference-arrow">→</span></Link><button className="preference-row" onClick={reset}><div><strong>Reset local sample data</strong><small>Recreate the sample records on the next page load.</small></div><DeleteSweepRounded /></button></section>}
      {isAdmin && <section className="surface-card security-note"><ShieldRounded /><div><strong>Before college deployment</strong><p>Until Firebase is connected, roles are checked inside this browser only. Connect Firebase and publish the included Firestore rules so the same limits are enforced on the server.</p></div></section>}
    </div>
  </div></AppShell>
}
