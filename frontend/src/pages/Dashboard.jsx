import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddRounded, ArrowForwardRounded, CalendarMonthRounded, NorthEastRounded, WorkHistoryRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import { moduleCards } from '../config/modules'
import { listRecords } from '../lib/dataStore'
import { dateParts, greetingName, statusClass, timeGreeting, todayLabel } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

function ProgressRing({ value = 0, label }) {
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="progress-ring" role="img" aria-label={`${label}: ${clamped}%`}>
      <svg viewBox="0 0 112 112">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E3C27A" />
            <stop offset="1" stopColor="#E0631F" />
          </linearGradient>
        </defs>
        <circle cx="56" cy="56" r={radius} className="ring-track" />
        <circle cx="56" cy="56" r={radius} className="ring-value" strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`} />
      </svg>
      <div className="progress-ring-label"><strong>{clamped}%</strong><span>{label}</span></div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState({ students: [], internships: [], placements: [], visits: [], talks: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all(['students','internships','placements','visits','talks'].map(listRecords)).then(([students, internships, placements, visits, talks]) => {
      if (mounted) { setData({ students, internships, placements, visits, talks }); setLoading(false) }
    }).catch(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  const placed = data.students.filter((item) => item.placementStatus === 'Placed').length
  const eligible = data.students.filter((item) => item.placementStatus === 'Eligible').length
  const openDrives = data.placements.filter((item) => ['Open', 'Scheduled'].includes(item.status)).length
  const activeInternships = data.internships.filter((item) => item.status === 'Active').length
  const placementRate = data.students.length ? Math.round((placed / data.students.length) * 100) : 0
  const timeline = useMemo(() => [...data.placements.map((item) => ({ type: 'Placement', title: item.company, detail: item.role, date: item.driveDate })), ...data.visits.map((item) => ({ type: 'Visit', title: item.organization, detail: item.location, date: item.date })), ...data.talks.map((item) => ({ type: 'Talk', title: item.speaker, detail: item.topic, date: item.date }))].sort((a,b) => new Date(a.date)-new Date(b.date)).slice(0,5), [data])
  const nextDrive = useMemo(() => data.placements.filter((item) => ['Open', 'Scheduled'].includes(item.status)).sort((a, b) => new Date(a.driveDate) - new Date(b.driveDate))[0], [data.placements])

  // Live meta line for every module card
  const moduleMeta = {
    internships: `${data.internships.length} listed · ${activeInternships} active`,
    placements: `${openDrives} open ${openDrives === 1 ? 'drive' : 'drives'}`,
    visits: `${data.visits.filter((item) => item.status === 'Planned').length} planned`,
    talks: `${data.talks.filter((item) => item.status === 'Scheduled').length} scheduled`,
    students: `${data.students.length} student records`,
    'add-student': 'Quick action',
  }

  return <AppShell title="Overview" subtitle="Placement Cell">
    <div className="page-stack">
      <PageBanner
        className="dashboard-banner"
        icon={CalendarMonthRounded}
        eyebrow={todayLabel}
        title={`${timeGreeting()},`}
        titleAccent={greetingName(user)}
        description="Here’s your view of internships, placement drives and student career activity — all in one place."
        actions={<>
          <Link className="primary-button" to="/students/add"><AddRounded /> Add student</Link>
          <Link className="glass-button" to="/drives"><WorkHistoryRounded /> View drives</Link>
        </>}
        aside={<div className="banner-aside-row">
          <ProgressRing value={loading ? 0 : placementRate} label="placed" />
          <div className="hero-facts">
            <div className="hero-mini-card"><span>Students ready</span><strong>{loading ? '…' : eligible + placed}</strong></div>
            <div className="hero-mini-card"><span>Next drive</span><strong>{nextDrive ? nextDrive.company : '—'}</strong>{nextDrive && <small>{dateParts(nextDrive.driveDate).day} {dateParts(nextDrive.driveDate).month}</small>}</div>
          </div>
        </div>}
        tiles={[
          { label: 'Students', value: loading ? '…' : data.students.length, note: `${placed} placed · ${eligible} eligible` },
          { label: 'Open drives', value: loading ? '…' : openDrives, note: 'Placement opportunities' },
          { label: 'Active internships', value: loading ? '…' : activeInternships, note: `${data.internships.length} listed in total` },
          { label: 'Placement rate', value: loading || !data.students.length ? '—' : `${placementRate}%`, note: 'Based on current data' },
        ]}
      />

      <section className="section-head"><div><span>Core modules</span><h3>Everything you need, without the clutter.</h3></div><Link to="/reports" className="text-link">View reports <ArrowForwardRounded /></Link></section>
      <section className="module-grid">{moduleCards.map((module) => { const Icon = module.icon; return <Link to={module.route} className="module-card" key={module.key}>
        <div className="module-card-top"><div className="module-icon"><Icon /></div><span className="module-arrow"><NorthEastRounded /></span></div>
        <div className="module-card-copy"><h4>{module.title}</h4><p>{module.description}</p></div>
        <span className="module-meta">{loading ? 'Loading…' : moduleMeta[module.key]}</span>
      </Link> })}</section>

      <section className="dashboard-bottom-grid">
        <div className="surface-card">
          <div className="surface-head"><div><span>Coming up</span><h3>Next 5 activities</h3></div><Link to="/drives" className="text-link">All drives <ArrowForwardRounded /></Link></div>
          <div className="timeline-list">{timeline.length ? timeline.map((item, index) => { const parts = dateParts(item.date); return <div className="timeline-item" key={`${item.type}-${item.title}-${index}`}>
            <div className="date-tile"><strong>{parts.day}</strong><span>{parts.month}</span></div>
            <div className="timeline-copy"><strong>{item.title}</strong><span>{item.detail}</span></div>
            <span className={`type-chip ${statusClass(item.type)}`}>{item.type}</span>
          </div> }) : <div className="empty-inline">No scheduled activity yet.</div>}</div>
        </div>
        <div className="surface-card focus-card">
          <div className="surface-head"><div><span>Placement pulse</span><h3>Keep your next action clear</h3></div></div>
          <div className="pulse-number"><strong>{eligible}</strong><span>eligible students waiting for a drive</span></div>
          <div className="pulse-meter"><span style={{ width: `${data.students.length ? Math.max(6, Math.min(100, (eligible / data.students.length) * 100)) : 6}%` }} /></div>
          <ul className="pulse-breakdown">{['Placed', 'In Process', 'Eligible', 'Not Eligible', 'Opted Out'].filter((label) => label !== 'Opted Out' || data.students.some((item) => item.placementStatus === label)).map((label) => <li key={label}><span className={`status-badge ${statusClass(label)}`}><i />{label}</span><strong>{loading ? '…' : data.students.filter((item) => item.placementStatus === label).length}</strong></li>)}</ul>
          <p>Update student records before the next placement drive so eligibility lists and communication stay accurate.</p>
          <Link to="/students" className="small-cta">Open master data <ArrowForwardRounded /></Link>
        </div>
      </section>
    </div>
  </AppShell>
}
