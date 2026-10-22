import { AccessTimeRounded, CloudDoneRounded, DarkModeRounded, Google, LightModeRounded, LockRounded, LogoutRounded, MailOutlineRounded, SettingsRounded, StorageRounded, VerifiedRounded, WarningAmberRounded } from '@mui/icons-material'
import { accountDetails, initials } from '../lib/utils'

const METHOD_ICON = { Google, 'Email & password': LockRounded, 'Demo account': LockRounded, 'College account': LockRounded }

/** Account card shown from the top-right avatar: who is signed in, how, since when, and quick actions. */
export default function ProfileMenu({ user, cloud, theme, onToggleTheme, onOpenSettings, onSignOut }) {
  const account = accountDetails(user, { cloud })
  const MethodIcon = METHOD_ICON[account.method] || LockRounded

  return (
    <div className="floating-menu profile-menu" role="dialog" aria-label="Your account">
      <div className="profile-card-head">
        <span className="profile-card-avatar">{account.photo ? <img src={account.photo} alt="" referrerPolicy="no-referrer" /> : initials(account.fullName)}</span>
        <div className="profile-card-id">
          <strong title={account.fullName}>{account.fullName}</strong>
          {account.email && <span title={account.email}><MailOutlineRounded /> {account.email}</span>}
          <em className={`account-chip ${account.isDemo || account.isLocal ? 'demo' : 'live'}`}>{account.chip}</em>
        </div>
      </div>

      <dl className="profile-facts">
        <div><dt><MethodIcon /> Signed in with</dt><dd>{account.method}</dd></div>
        <div><dt><AccessTimeRounded /> Last sign-in</dt><dd>{account.signedIn}</dd></div>
        {account.verified !== null && <div><dt>{account.verified ? <VerifiedRounded /> : <WarningAmberRounded />} Email</dt><dd className={account.verified ? 'ok' : 'warn'}>{account.verified ? 'Verified' : 'Not verified'}</dd></div>}
        <div><dt>{account.storage.startsWith('College') ? <CloudDoneRounded /> : <StorageRounded />} Data saved in</dt><dd>{account.storage}</dd></div>
      </dl>

      <div className="profile-actions">
        <button type="button" onClick={onOpenSettings}><SettingsRounded /><span>Profile &amp; settings</span></button>
        <button type="button" onClick={onToggleTheme}>{theme === 'light' ? <DarkModeRounded /> : <LightModeRounded />}<span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span><em className={`mini-switch ${theme === 'dark' ? 'on' : ''}`} aria-hidden="true"><i /></em></button>
        <button type="button" className="sign-out" onClick={onSignOut}><LogoutRounded /><span>Sign out</span></button>
      </div>
    </div>
  )
}
