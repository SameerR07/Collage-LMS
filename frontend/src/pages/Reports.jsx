import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { FileDownloadRounded, InsightsRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import { listRecords } from '../lib/dataStore'
import { logActivity } from '../lib/activity'
import { statusClass } from '../lib/utils'
import { useToast } from '../context/ToastContext'

// Placement status → semantic colour token (kept in one place so charts and badges agree)
const STATUS_ORDER = ['Placed', 'In Process', 'Eligible', 'Not Eligible', 'Opted Out']
const STATUS_COLOR = { Placed: 'var(--ok)', 'In Process': 'var(--warn)', Eligible: 'var(--info)', 'Not Eligible': 'var(--danger)', 'Opted Out': 'var(--neutral)' }

/* ---------- Career-preference helpers (free-text answers from registration forms) ---------- */
const tidy = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const niceCase = (text) => (text === text.toLowerCase() ? text.replace(/\b\w/g, (char) => char.toUpperCase()) : text)

/** Counts answers like "Full Stack", "full stack ", "Chandigarh / Mohali" (split on / and ,) case-insensitively. */
function topAnswers(students, keys, limit = 6) {
  const counts = new Map()
  students.forEach((student) => keys.forEach((key) => {
    tidy(student[key]).split(/[/,]/).map(tidy).filter(Boolean).forEach((answer) => {
      const id = answer.toLowerCase()
      const entry = counts.get(id) || { label: niceCase(answer), count: 0 }
      entry.count += 1
      counts.set(id, entry)
    })
  }))
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit)
}

const average = (values) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null)
const marks = (students, key) => students.map((student) => Number(student[key])).filter((value) => Number.isFinite(value) && String(value) !== '' && value > 0)

function BarList({ items, tone = '' }) {
  const max = Math.max(1, ...items.map((item) => item.count))
  if (!items.length) return <p className="empty-inline">No answers yet.</p>
  return <div className="bar-list">{items.map((item) => <div className="bar-item" key={item.label}><div className="bar-label"><span>{item.label}</span><strong>{item.count}</strong></div><div className={`bar-track ${tone}`}><span style={{ width: `${(item.count / max) * 100}%` }} /></div></div>)}</div>
}

function Donut({ segments, total }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const gap = segments.length > 1 ? 3 : 0
  // Pre-compute each arc's length and start offset (pure — no mutation during render)
  const arcs = segments.map(([label, value], index) => {
    const length = total ? (value / total) * circumference : 0
    const start = segments.slice(0, index).reduce((sum, [, v]) => sum + (total ? (v / total) * circumference : 0), 0)
    return { label, length, start }
  })
  return (
    <div className="donut" role="img" aria-label={`Placement status for ${total} students`}>
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} className="donut-track" />
        <g transform="rotate(-90 70 70)">
          {arcs.map(({ label, length, start }) => <circle key={label} cx="70" cy="70" r={radius} className="donut-seg" style={{ stroke: STATUS_COLOR[label] || 'var(--ink-400)' }} strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`} strokeDashoffset={-start} />)}
        </g>
      </svg>
      <div className="donut-center"><strong>{total}</strong><span>students</span></div>
    </div>
  )
}

export default function Reports() {
  const { push } = useToast(); const [data, setData] = useState({ students: [], placements: [], internships: [] })
  useEffect(() => { Promise.all(['students','placements','internships'].map(listRecords)).then(([students, placements, internships]) => setData({ students, placements, internships })) }, [])
  const courseBreakdown = useMemo(() => { const counts={}; data.students.forEach((item)=>{counts[item.course]=(counts[item.course]||0)+1}); return Object.entries(counts).sort((a,b)=>b[1]-a[1]) }, [data.students])
  const statusBreakdown = useMemo(() => { const counts={}; data.students.forEach((item)=>{counts[item.placementStatus]=(counts[item.placementStatus]||0)+1}); return Object.entries(counts).sort((a,b)=>{ const ia=STATUS_ORDER.indexOf(a[0]); const ib=STATUS_ORDER.indexOf(b[0]); return (ia<0?99:ia)-(ib<0?99:ib) }) }, [data.students])
  const driveBreakdown = useMemo(() => { const counts={}; data.placements.forEach((item)=>{counts[item.status]=(counts[item.status]||0)+1}); return Object.entries(counts).sort((a,b)=>b[1]-a[1]) }, [data.placements])
  const exportReport = () => { const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.students),'Students'); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.placements),'Placements'); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.internships),'Internships'); XLSX.writeFile(wb,`gjimt-placement-report-${new Date().toISOString().slice(0,10)}.xlsx`); push('Full Excel report downloaded.','info'); logActivity('Downloaded the full Excel report', { area: 'Reports', category: 'download' }) }
  const maxCourse = Math.max(1, ...courseBreakdown.map(([, value]) => value))
  const maxDrive = Math.max(1, ...driveBreakdown.map(([, value]) => value))
  const placed = data.students.filter((s)=>s.placementStatus==='Placed').length

  // Career preferences — shown only when students have registration details
  const preferences = useMemo(() => {
    const students = data.students
    const hasAny = students.some((student) => ['placementInterest', 'jobArea1', 'locationPref1', 'specialization', 'tenthPercent'].some((key) => tidy(student[key])))
    if (!hasAny) return null
    const interested = students.filter((student) => student.placementInterest === 'Yes').length
    const notInterested = students.filter((student) => student.placementInterest === 'No').length
    const tenth = marks(students, 'tenthPercent'); const twelfth = marks(students, 'twelfthPercent'); const graduation = marks(students, 'graduationPercent')
    const withAllMarks = students.filter((student) => ['tenthPercent', 'twelfthPercent', 'graduationPercent'].every((key) => Number(student[key]) > 0))
    const sixtyThroughout = withAllMarks.filter((student) => ['tenthPercent', 'twelfthPercent', 'graduationPercent'].every((key) => Number(student[key]) >= 60)).length
    return {
      interested, notInterested, unanswered: students.length - interested - notInterested,
      jobAreas: topAnswers(students, ['jobArea1', 'jobArea2', 'jobArea3']),
      locations: topAnswers(students, ['locationPref1', 'locationPref2', 'locationPref3']),
      specializations: topAnswers(students, ['specialization']),
      averages: [['10th', average(tenth)], ['12th', average(twelfth)], ['Graduation', average(graduation)]],
      withAllMarks: withAllMarks.length, sixtyThroughout,
    }
  }, [data.students])

  return <AppShell title="Reports & Analytics" subtitle="Insights"><div className="page-stack">
    <PageBanner
      icon={InsightsRounded}
      eyebrow="Insights"
      title="Reports & Analytics"
      description="Decision-ready views of students, drives and outcomes."
      actions={<button className="primary-button" onClick={exportReport}><FileDownloadRounded /> Export full report</button>}
      tiles={[
        { label: 'Total students', value: data.students.length, note: 'Master data' },
        { label: 'Placed', value: placed, note: 'Current outcomes' },
        { label: 'Placement drives', value: data.placements.length, note: 'Open + closed' },
        { label: 'Internship offers', value: data.internships.length, note: 'Tracked opportunities' },
      ]}
    />
    <section className="report-grid">
      <div className="surface-card chart-card">
        <div className="surface-head"><div><span>Career funnel</span><h3>Placement status</h3></div></div>
        <div className="donut-layout">
          <Donut segments={statusBreakdown} total={data.students.length} />
          <ul className="chart-legend">{statusBreakdown.map(([label, value]) => <li key={label}><i style={{ background: STATUS_COLOR[label] || 'var(--ink-400)' }} /><span>{label}</span><strong>{value}</strong><small>{data.students.length ? Math.round((value / data.students.length) * 100) : 0}%</small></li>)}</ul>
        </div>
      </div>
      <div className="surface-card chart-card">
        <div className="surface-head"><div><span>Student mix</span><h3>By course</h3></div></div>
        <div className="bar-list">{courseBreakdown.map(([label,value])=><div className="bar-item" key={label}><div className="bar-label"><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><span style={{width:`${(value/maxCourse)*100}%`}} /></div></div>)}</div>
        <div className="surface-head sub-head"><div><span>Drive pipeline</span><h3>Placement drives by status</h3></div></div>
        <div className="bar-list">{driveBreakdown.map(([label,value])=><div className="bar-item" key={label}><div className="bar-label"><span>{label}</span><strong>{value}</strong></div><div className={`bar-track tone-${statusClass(label)}`}><span style={{width:`${(value/maxDrive)*100}%`}} /></div></div>)}</div>
      </div>
    </section>
    {preferences && <>
      <section className="section-head"><div><span>From student registrations</span><h3>What students are looking for</h3></div></section>
      <section className="report-grid">
        <div className="surface-card chart-card">
          <div className="surface-head"><div><span>Placement interest</span><h3>Who wants placement support</h3></div></div>
          <div className="interest-split">
            <div className="interest yes"><strong>{preferences.interested}</strong><span>Interested</span></div>
            <div className="interest no"><strong>{preferences.notInterested}</strong><span>Not interested (Opted Out)</span></div>
            <div className="interest none"><strong>{preferences.unanswered}</strong><span>Not answered</span></div>
          </div>
          <div className="stacked-bar" role="img" aria-label={`${preferences.interested} interested, ${preferences.notInterested} not interested, ${preferences.unanswered} not answered`}>
            {[['yes', preferences.interested], ['no', preferences.notInterested], ['none', preferences.unanswered]].map(([key, value]) => value > 0 && <span key={key} className={key} style={{ flexGrow: value }} />)}
          </div>
          <div className="surface-head sub-head"><div><span>Academic snapshot</span><h3>Average marks</h3></div></div>
          <div className="marks-row">{preferences.averages.map(([label, value]) => <div key={label}><strong>{value === null ? '—' : `${value}%`}</strong><span>{label}</span></div>)}</div>
          <p className="import-note"><strong>{preferences.sixtyThroughout}</strong> of {preferences.withAllMarks} students with all three marks have 60%+ in 10th, 12th and graduation — the most common company cut-off.</p>
          <div className="surface-head sub-head"><div><span>Skills</span><h3>Specializations in the batch</h3></div><small className="chart-hint">invite companies that match</small></div>
          <BarList items={preferences.specializations} />
        </div>
        <div className="surface-card chart-card">
          <div className="surface-head"><div><span>Job areas</span><h3>Most wanted roles</h3></div><small className="chart-hint">choices 1–3 combined</small></div>
          <BarList items={preferences.jobAreas} tone="tone-ember" />
          <div className="surface-head sub-head"><div><span>Locations</span><h3>Preferred job locations</h3></div></div>
          <BarList items={preferences.locations} tone="tone-gold" />
        </div>
      </section>
    </>}
    <section className="surface-card insight-card"><div className="insight-icon"><InsightsRounded /></div><div><span>Quick insight</span><h3>Keep master data fresh before every drive.</h3><p>Placement decisions become faster when the student list, course, batch and placement status are already accurate.</p></div></section>
  </div></AppShell>
}
