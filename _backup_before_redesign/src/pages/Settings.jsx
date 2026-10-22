import { Link } from 'react-router-dom'
import { DarkModeRounded, DeleteSweepRounded, Google, SettingsRounded, ShieldRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { resetLocalData } from '../lib/dataStore'
import { firstName } from '../lib/utils'

export default function Settings() {
  const { user, isFirebaseConfigured, demoEmail } = useAuth(); const { theme, toggleTheme } = useTheme(); const { push } = useToast()
  const reset = () => { if (!window.confirm('Reset only local demo data? Cloud Firebase records are not deleted by this button.')) return; resetLocalData(); push('Local demo data reset. Refresh a module to recreate sample rows.','info') }
  return <AppShell title="Settings" subtitle="Account & preferences"><div className="page-stack settings-page">
    <div className="page-heading-row"><div className="page-heading-left"><div className="page-title-icon blue"><SettingsRounded /></div><div><span className="page-eyebrow">Personal workspace</span><h2>Profile &amp; Settings</h2><p>Keep your account preferences comfortable and your demo environment clear.</p></div></div></div>
    <div className="settings-grid">
      <section className="surface-card profile-card-wide"><div className="profile-banner"><div className="big-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : firstName(user).charAt(0).toUpperCase()}</div><div><span>Signed in as</span><h3>{user?.displayName || 'Placement Cell User'}</h3><p>{user?.email || demoEmail}</p></div></div><div className="setting-row"><div><strong>Authentication</strong><p>{isFirebaseConfigured ? 'Firebase Authentication is connected.' : 'Local demo authentication is active until Firebase is connected.'}</p></div><span className={`connection-pill ${isFirebaseConfigured ? 'connected' : 'demo'}`}><i />{isFirebaseConfigured ? 'Connected' : 'Demo mode'}</span></div><div className="setting-row"><div><strong>Google Login</strong><p>{isFirebaseConfigured ? 'Available from the login screen.' : 'Enable Google provider in Firebase to make this live.'}</p></div><Google /></div></section>
      <section className="surface-card settings-list"><div className="surface-head"><div><span>Preferences</span><h3>Interface</h3></div><DarkModeRounded /></div><button className="preference-row" onClick={toggleTheme}><div><strong>Theme</strong><small>Switch between light and dark mode.</small></div><span className="preference-value">{theme === 'light' ? 'Light' : 'Dark'}</span></button></section>
      <section className="surface-card settings-list"><div className="surface-head"><div><span>Demo utilities</span><h3>Data controls</h3></div><DeleteSweepRounded /></div><button className="preference-row" onClick={reset}><div><strong>Reset local demo data</strong><small>Recreate the teacher demo records on the next page load.</small></div><DeleteSweepRounded /></button><Link to="/students" className="preference-row"><div><strong>Open master data</strong><small>Review and manage student records.</small></div><span className="preference-arrow">→</span></Link></section>
      <section className="surface-card security-note"><ShieldRounded /><div><strong>Before college deployment</strong><p>The included Firestore rules are intentionally simple for a classroom/demo build. For a real institutional rollout, restrict write access by staff role before publishing the app publicly.</p></div></section>
    </div>
  </div></AppShell>
}
