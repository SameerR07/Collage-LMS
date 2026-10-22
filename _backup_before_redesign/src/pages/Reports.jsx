import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { BarChartRounded, FileDownloadRounded, GroupRounded, InsightsRounded, WorkspacePremiumRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import StatCard from '../components/StatCard'
import { listRecords } from '../lib/dataStore'
import { useToast } from '../context/ToastContext'

export default function Reports() {
  const { push } = useToast(); const [data, setData] = useState({ students: [], placements: [], internships: [] })
  useEffect(() => { Promise.all(['students','placements','internships'].map(listRecords)).then(([students, placements, internships]) => setData({ students, placements, internships })) }, [])
  const courseBreakdown = useMemo(() => { const counts={}; data.students.forEach((item)=>{counts[item.course]=(counts[item.course]||0)+1}); return Object.entries(counts).sort((a,b)=>b[1]-a[1]) }, [data.students])
  const statusBreakdown = useMemo(() => { const counts={}; data.students.forEach((item)=>{counts[item.placementStatus]=(counts[item.placementStatus]||0)+1}); return Object.entries(counts).sort((a,b)=>b[1]-a[1]) }, [data.students])
  const exportReport = () => { const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.students),'Students'); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.placements),'Placements'); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.internships),'Internships'); XLSX.writeFile(wb,`gjimt-placement-report-${new Date().toISOString().slice(0,10)}.xlsx`); push('Full Excel report downloaded.','info') }
  const maxStatus=Math.max(1,...statusBreakdown.map(([,value])=>value))
  return <AppShell title="Reports & Analytics" subtitle="Data snapshot"><div className="page-stack">
    <div className="page-heading-row"><div className="page-heading-left"><div className="page-title-icon green"><BarChartRounded /></div><div><span className="page-eyebrow">Insights</span><h2>Reports &amp; Analytics</h2><p>Simple decision-ready views without a complicated analytics screen.</p></div></div><button className="primary-button" onClick={exportReport}><FileDownloadRounded /> Export full report</button></div>
    <section className="stat-grid"><StatCard icon={GroupRounded} label="Total students" value={data.students.length} note="Master data" color="blue" /><StatCard icon={WorkspacePremiumRounded} label="Placed" value={data.students.filter((s)=>s.placementStatus==='Placed').length} note="Current outcomes" color="green" /><StatCard icon={InsightsRounded} label="Placement drives" value={data.placements.length} note="Open + closed" color="orange" /><StatCard icon={BarChartRounded} label="Internship offers" value={data.internships.length} note="Tracked opportunities" color="purple" /></section>
    <section className="report-grid"><div className="surface-card chart-card"><div className="surface-head"><div><span>Student mix</span><h3>By course</h3></div></div><div className="bar-list">{courseBreakdown.map(([label,value])=><div className="bar-item" key={label}><div className="bar-label"><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><span style={{width:`${(value/Math.max(1,data.students.length))*100}%`}} /></div></div>)}</div></div>
      <div className="surface-card chart-card"><div className="surface-head"><div><span>Career funnel</span><h3>Placement status</h3></div></div><div className="bar-list">{statusBreakdown.map(([label,value])=><div className="bar-item" key={label}><div className="bar-label"><span>{label}</span><strong>{value}</strong></div><div className="bar-track accent"><span style={{width:`${(value/maxStatus)*100}%`}} /></div></div>)}</div></div>
    </section>
    <section className="surface-card insight-card"><div className="insight-icon"><InsightsRounded /></div><div><span>Quick insight</span><h3>Keep master data fresh before every drive.</h3><p>Placement decisions become faster when the student list, course, batch and placement status are already accurate.</p></div></section>
  </div></AppShell>
}
