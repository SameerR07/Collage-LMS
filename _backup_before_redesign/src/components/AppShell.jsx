import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { DarkModeRounded, KeyboardArrowDownRounded, LightModeRounded, LogoutRounded, MenuRounded, NotificationsNoneRounded, SearchRounded, SettingsRounded, CloseRounded } from '@mui/icons-material'
import { sideNav } from '../config/modules'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { firstName } from '../lib/utils'

const avatarFallback = (user) => user?.photoURL || firstName(user).charAt(0).toUpperCase()

export default function AppShell({ children, title = 'Overview', subtitle = 'Placement Cell' }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [search, setSearch] = useState('')

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return sideNav.filter((item) => item.label.toLowerCase().includes(term)).slice(0, 5)
  }, [search])

  const handleLogout = async () => { setProfileOpen(false); await logout(); navigate('/login', { replace: true }) }
  const go = (route) => { navigate(route); setSearch(''); setSidebarOpen(false); setProfileOpen(false) }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/" onClick={() => setSidebarOpen(false)}><img src="/gjimt-brand.png" alt="GJIMT NAAC" className="brand-logo" /><span className="brand-product">PLACEMENT LMS</span></Link>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><CloseRounded /></button>
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav className="side-nav" aria-label="Main navigation">
          {sideNav.map((item) => { const Icon = item.icon; return <NavLink key={item.route} to={item.route} end={item.route === '/'} className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`} onClick={() => setSidebarOpen(false)}><Icon /><span>{item.label}</span></NavLink> })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-footer">
          <button className="side-link" onClick={() => go('/settings')}><SettingsRounded /><span>Settings</span></button>
          <div className="sidebar-mini-note"><span className="live-dot" /><div><strong>Portal online</strong><small>GJIMT Placement Cell</small></div></div>
        </div>
      </aside>

      <main className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><MenuRounded /></button>
            <div><p className="topbar-eyebrow">Gian Jyoti Institute of Management &amp; Technology</p><h1 className="topbar-title">{title}</h1><p className="topbar-subtitle">{subtitle}</p></div>
          </div>
          <div className="topbar-actions">
            <div className="global-search"><SearchRounded /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Quick find…" aria-label="Quick find" />{searchResults.length > 0 && <div className="search-popover">{searchResults.map((result) => { const Icon = result.icon; return <button key={result.route} onClick={() => go(result.route)}><Icon /><span>{result.label}</span></button> })}</div>}</div>
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'light' ? <DarkModeRounded /> : <LightModeRounded />}</button>
            <div className="notification-wrap">
              <button className="icon-button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifications"><NotificationsNoneRounded /><span className="notification-dot">3</span></button>
              {notificationsOpen && <div className="floating-menu notification-menu"><div className="floating-menu-head"><strong>Notifications</strong><span>3 new</span></div><button onClick={() => setNotificationsOpen(false)}><span className="notif-chip orange">JD</span><div><strong>TechNova drive</strong><small>Eligibility list is ready.</small></div></button><button onClick={() => setNotificationsOpen(false)}><span className="notif-chip blue">EV</span><div><strong>Industrial visit</strong><small>Faculty coordinator updated.</small></div></button><button onClick={() => setNotificationsOpen(false)}><span className="notif-chip green">TA</span><div><strong>Alumni talk</strong><small>Speaker confirmed the slot.</small></div></button></div>}
            </div>
            <div className="profile-wrap">
              <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)}>{user?.photoURL ? <img src={user.photoURL} alt="" /> : <span className="avatar-fallback">{avatarFallback(user)}</span>}<div className="profile-text"><strong>{firstName(user)}</strong><span>Placement Cell</span></div><KeyboardArrowDownRounded /></button>
              {profileOpen && <div className="floating-menu profile-menu"><button onClick={() => go('/settings')}><SettingsRounded /><span>Profile &amp; settings</span></button><button onClick={handleLogout}><LogoutRounded /><span>Sign out</span></button></div>}
            </div>
          </div>
        </header>
        <section className="shell-content">{children}</section>
      </main>
    </div>
  )
}
