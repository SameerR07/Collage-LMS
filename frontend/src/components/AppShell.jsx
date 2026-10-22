import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ChevronRightRounded, CloseRounded, DarkModeRounded, KeyboardArrowDownRounded, LightModeRounded, MenuRounded, NotificationsNoneRounded, SearchRounded, SettingsRounded } from '@mui/icons-material'
import { sideNav } from '../config/modules'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { greetingName, initials } from '../lib/utils'
import { canAccess, homeFor, roleLabel } from '../lib/roles'
import { usePendingUsers } from '../lib/userAdmin'
import { sendWaitingOnce } from '../lib/notify'
import ProfileMenu from './ProfileMenu'

// Only the pages this role may open appear in the menu and in Quick find.
const navFor = (role) => sideNav.filter((item) => canAccess(role, item.route))

export default function AppShell({ children, title = 'Overview', subtitle = 'Placement Cell' }) {
  const { user, logout, isFirebaseConfigured } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [photoFailed, setPhotoFailed] = useState(false) // e.g. offline — show initials instead
  const searchRef = useRef(null)
  const role = user?.role
  const nav = useMemo(() => navFor(role), [role])
  const workspaceNav = nav.filter((item) => !item.group)
  const insightNav = nav.filter((item) => item.group === 'insights')
  const adminNav = nav.filter((item) => item.group === 'admin')
  const pendingUsers = usePendingUsers(role === 'admin')
  const home = homeFor(role)
  const notificationRef = useRef(null)
  const profileRef = useRef(null)

  // Staff: send any emails left waiting in the outbox (once per visit, quietly)
  useEffect(() => { if (role === 'admin' || role === 'placement') sendWaitingOnce() }, [role])

  // Close the account / notification menus on a click outside them or on Escape.
  useEffect(() => {
    if (!profileOpen && !notificationsOpen) return undefined
    const onPointer = (event) => {
      if (profileRef.current?.contains(event.target) || notificationRef.current?.contains(event.target)) return
      setProfileOpen(false); setNotificationsOpen(false)
    }
    const onKey = (event) => { if (event.key === 'Escape') { setProfileOpen(false); setNotificationsOpen(false) } }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [profileOpen, notificationsOpen])

  // Press "/" anywhere (outside a text field) to jump into Quick find.
  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !event.target?.isContentEditable) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return nav.filter((item) => item.label.toLowerCase().includes(term)).slice(0, 5)
  }, [search, nav])

  const handleLogout = async () => { setProfileOpen(false); await logout(); navigate('/login', { replace: true }) }
  const go = (route) => { navigate(route); setSearch(''); setSidebarOpen(false); setProfileOpen(false) }
  const displayName = greetingName(user)

  const renderLink = (item) => {
    const Icon = item.icon
    const badge = item.route === '/users' && pendingUsers > 0 ? <em className="side-badge" title={`${pendingUsers} waiting for approval`}>{pendingUsers}</em> : null
    return <NavLink key={item.route} to={item.route} end={item.route === '/' || item.route === '/students' || item.route === '/student'} className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`} onClick={() => setSidebarOpen(false)}><Icon /><span>{item.label}</span>{badge}</NavLink>
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Link to={home} onClick={() => setSidebarOpen(false)} className="sidebar-brand-link">
            <span className="logo-plate"><img src="/gjimt-brand.png" alt="GJIMT — NAAC accredited" className="brand-logo" /></span>
            <span className="brand-product">Placement LMS</span>
          </Link>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><CloseRounded /></button>
        </div>
        <div className="sidebar-label">{role === 'placement' ? 'Placement Cell' : role === 'student' ? 'Student portal' : 'Workspace'}</div>
        <nav className="side-nav" aria-label="Main navigation">{workspaceNav.map(renderLink)}</nav>
        {insightNav.length > 0 && <><div className="sidebar-label">Insights</div>
        <nav className="side-nav" aria-label="Insights">{insightNav.map(renderLink)}</nav></>}
        {adminNav.length > 0 && <><div className="sidebar-label">Administration</div>
        <nav className="side-nav" aria-label="Administration">{adminNav.map(renderLink)}</nav></>}
        <div className="sidebar-spacer" />
        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`} onClick={() => setSidebarOpen(false)}><SettingsRounded /><span>Settings</span></NavLink>
          <div className="sidebar-mini-note"><span className="live-dot" /><div><strong>{roleLabel(role)} portal</strong><small>GJIMT Placement LMS</small></div></div>
        </div>
      </aside>

      <main className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><MenuRounded /></button>
            <div className="topbar-heading">
              <p className="topbar-eyebrow"><span>GJIMT</span><ChevronRightRounded /><span>{subtitle}</span></p>
              <h1 className="topbar-title">{title}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <SearchRounded />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Jump to a module…" aria-label="Quick find" />
              <kbd>/</kbd>
              {searchResults.length > 0 && <div className="search-popover">{searchResults.map((result) => { const Icon = result.icon; return <button key={result.route} onClick={() => go(result.route)}><Icon /><span>{result.label}</span></button> })}</div>}
            </div>
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>{theme === 'light' ? <DarkModeRounded /> : <LightModeRounded />}</button>
            {role === 'admin' && <div className="notification-wrap" ref={notificationRef}>
              <button className="icon-button" onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false) }} aria-label="Notifications"><NotificationsNoneRounded /><span className="notification-dot">3</span></button>
              {notificationsOpen && <div className="floating-menu notification-menu">
                <div className="floating-menu-head"><strong>Notifications</strong><span>3 new</span></div>
                <button onClick={() => setNotificationsOpen(false)}><span className="notif-chip orange">JD</span><div><strong>TechNova drive</strong><small>Eligibility list is ready.</small></div></button>
                <button onClick={() => setNotificationsOpen(false)}><span className="notif-chip blue">EV</span><div><strong>Industrial visit</strong><small>Faculty coordinator updated.</small></div></button>
                <button onClick={() => setNotificationsOpen(false)}><span className="notif-chip green">TA</span><div><strong>Alumni talk</strong><small>Speaker confirmed the slot.</small></div></button>
              </div>}
            </div>}
            <div className="profile-wrap" ref={profileRef}>
              <button className="profile-trigger" onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false) }} aria-label="Your account" aria-expanded={profileOpen} aria-haspopup="dialog">
                {user?.photoURL && !photoFailed ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} /> : <span className="avatar-fallback">{initials(user?.displayName || displayName)}</span>}
                <div className="profile-text"><strong>{displayName}</strong><span>{roleLabel(role)}</span></div>
                <KeyboardArrowDownRounded />
              </button>
              {profileOpen && <ProfileMenu user={user} cloud={isFirebaseConfigured} theme={theme} onToggleTheme={toggleTheme} onOpenSettings={() => go('/settings')} onSignOut={handleLogout} />}
            </div>
          </div>
        </header>
        <section className="shell-content">{children}</section>
      </main>
    </div>
  )
}
