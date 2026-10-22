export default function StatCard({ icon: Icon, label, value, note, color = 'blue' }) {
  return <div className="stat-card"><div className={`stat-icon stat-${color}`}><Icon /></div><div className="stat-main"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>
}
