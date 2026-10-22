import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddRounded, ArrowForwardRounded, CalendarMonthRounded, ChevronRightRounded, EventAvailableRounded, GroupRounded, RocketLaunchRounded, TrendingUpRounded, WorkHistoryRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import StatCard from '../components/StatCard'
import { moduleCards } from '../config/modules'
import { listRecords } from '../lib/dataStore'
import { firstName, formatDate, statusClass } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

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
  const timeline = useMemo(() => [...data.placements.map((item) => ({ type: 'Placement', title: item.company, detail: item.role, date: item.driveDate })), ...data.visits.map((item) => ({ type: 'Visit', title: item.organization, detail: item.location, date: item.date })), ...data.talks.map((item) => ({ type: 'Talk', title: item.speaker, detail: item.topic, date: item.date }))].sort((a,b) => new Date(a.date)-new Date(b.date)).slice(0,5), [data])

  return <AppShell title="Overview" subtitle="Placement Cell">
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy"><span className="hero-kicker"><RocketLaunchRounded /> Placement workspace</span><h2>Hey {firstName(user)} 👋</h2><p>Here’s your quick view of what’s happening across internships, placements and student career activity.</p><div className="hero-actions"><Link className="hero-action primary" to="/students/add"><AddRounded /> Add student</Link><Link className="hero-action secondary" to="/placements"><WorkHistoryRounded /> View drives</Link></div></div>
        <div className="hero-side"><div className="hero-mini-card"><span>Live portal</span><strong><i /> Online</strong></div><div className="hero-mini-card"><span>Students ready</span><strong>{eligible + placed}</strong></div><div className="hero-ring"><TrendingUpRounded /><span>Career<br />flow</span></div></div>
      </section>
      <section className="stat-grid">
        <StatCard icon={GroupRounded} label="Students" value={loading ? '…' : data.students.length} note={`${placed} placed · ${eligible} eligible`} color="blue" />
        <StatCard icon={EventAvailableRounded} label="Open drives" value={loading ? '…' : openDrives} note="Placement opportunities" color="orange" />
        <StatCard icon={WorkHistoryRounded} label="Internships" value={loading ? '…' : activeInternships} note="Active right now" color="purple" />
        <StatCard icon={TrendingUpRounded} label="Placement rate" value={loading || !data.students.length ? '—' : `${Math.round((placed / data.students.length) * 100)}%`} note="Based on current data" color="green" />
      </section>
      <section className="section-head"><div><span>Core modules</span><h3>Everything you need, without the clutter.</h3></div><Link to="/reports" className="text-link">View reports <ArrowForwardRounded /></Link></section>
      <section className="module-grid">{moduleCards.map((module) => { const Icon = module.icon; return <Link to={module.route} className="module-card" key={module.key}><div className={`module-icon ${module.color}`}><Icon /></div><div className="module-card-copy"><span className="module-label">Placement LMS</span><h4>{module.title}</h4><p>{module.description}</p></div><span className="module-arrow"><ChevronRightRounded /></span></Link> })}</section>
      <section className="dashboard-bottom-grid">
        <div className="surface-card"><div className="surface-head"><div><span>Coming up</span><h3>Next 5 activities</h3></div><CalendarMonthRounded /></div><div className="timeline-list">{timeline.length ? timeline.map((item, index) => <div className="timeline-item" key={`${item.type}-${item.title}-${index}`}><div className={`timeline-dot ${statusClass(item.type)}`} /><div className="timeline-copy"><strong>{item.title}</strong><span>{item.type} · {item.detail}</span></div><time>{formatDate(item.date)}</time></div>) : <div className="empty-inline">No scheduled activity yet.</div>}</div></div>
        <div className="surface-card focus-card"><div className="surface-head"><div><span>Placement pulse</span><h3>Keep your next action clear</h3></div></div><div className="pulse-meter"><span style={{ width: `${data.students.length ? Math.max(8, Math.min(100, (eligible / data.students.length) * 100)) : 8}%` }} /></div><div className="pulse-number"><strong>{eligible}</strong><span>eligible students</span></div><p>Update student records before the next placement drive so eligibility and communication stay accurate.</p><Link to="/students" className="small-cta">Open master data <ArrowForwardRounded /></Link></div>
      </section>
    </div>
  </AppShell>
}
