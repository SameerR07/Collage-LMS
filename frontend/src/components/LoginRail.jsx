import { BarChartRounded, BusinessCenterRounded, SchoolRounded } from '@mui/icons-material'
import { campusPhotos, quickStatsText } from '../config/loginShowcase'
import { useLoginStats } from '../lib/useLoginStats'
import { formatCount, formatRate } from '../lib/statsCore'

// Photos dropped into src/assets/login/ are found at build time — no code change needed.
const PHOTO_FILES = import.meta.glob('../assets/login/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}', { eager: true, import: 'default' })
const photoUrl = (name = '') => {
  const wanted = name.toLowerCase()
  const match = Object.entries(PHOTO_FILES).find(([path]) => path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase() === wanted)
  return match ? match[1] : ''
}

const TILE_ICONS = { work: BusinessCenterRounded, campus: SchoolRounded }

function PhotoCard({ photo, delay }) {
  const src = photoUrl(photo.file)
  const Icon = TILE_ICONS[photo.icon] || SchoolRounded
  return (
    <figure className={`rail-card rail-photo ${src ? 'has-photo' : 'is-tile'}`} style={{ '--delay': `${delay}ms` }}>
      {src
        ? <img src={src} alt={photo.alt} decoding="async" style={photo.position ? { objectPosition: photo.position } : undefined} />
        : <span className="rail-tile-art" aria-hidden="true"><i><Icon /></i></span>}
      <figcaption>{photo.caption}</figcaption>
    </figure>
  )
}

/** Sparkline of companies seen so far, month by month (real data; flat when nothing changed). */
function TrendLine({ points }) {
  const width = 56
  const height = 24
  const min = Math.min(...points)
  const max = Math.max(...points)
  const xy = points.map((value, index) => {
    const x = 2 + (index * (width - 4)) / (points.length - 1)
    const y = max === min ? height / 2 : height - 3 - ((value - min) / (max - min)) * (height - 6)
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  })
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M${xy[0][0]} ${height} L${xy.map(([x, y]) => `${x} ${y}`).join(' L')} L${xy[xy.length - 1][0]} ${height} Z`
  return (
    <svg className="stat-visual trend" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="area" d={area} />
      <polyline points={line} />
    </svg>
  )
}

function Ring({ percent }) {
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const filled = (Math.max(0, Math.min(100, percent || 0)) / 100) * circumference
  return (
    <svg className="stat-visual ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle className="track" cx="18" cy="18" r={radius} />
      <circle className="fill" cx="18" cy="18" r={radius} strokeDasharray={`${filled} ${circumference}`} transform="rotate(-90 18 18)" />
    </svg>
  )
}

/** Right-hand column on the login page: campus photo · live quick stats · campus photo. */
export default function LoginRail() {
  const [first, second] = campusPhotos
  const stats = useLoginStats()
  const text = quickStatsText
  const rows = [
    {
      key: 'students',
      label: text.students,
      value: formatCount(stats?.totalStudents),
      hint: 'Student records in Master Data',
    },
    {
      key: 'companies',
      label: text.companies,
      value: formatCount(stats?.recruitingCompanies),
      hint: 'Different companies across placement drives, internships and students’ placed company',
      visual: stats?.companyTrend ? <TrendLine points={stats.companyTrend} /> : null,
    },
    {
      key: 'placement',
      label: text.placement,
      value: formatRate(stats?.placementRate),
      hint: Number.isFinite(stats?.placed) && Number.isFinite(stats?.totalStudents) ? `${formatCount(stats.placed)} of ${formatCount(stats.totalStudents)} students placed` : 'Placed students out of all students',
      visual: Number.isFinite(stats?.placementRate) ? <Ring percent={stats.placementRate} /> : null,
      tone: 'good',
    },
  ]

  return (
    <aside className="login-rail" aria-label="GJIMT at a glance">
      {first && <PhotoCard photo={first} delay={140} />}
      <section className="rail-card rail-stats" aria-labelledby="rail-stats-title" style={{ '--delay': '220ms' }}>
        <header><h3 id="rail-stats-title">{text.title}</h3><BarChartRounded aria-hidden="true" /></header>
        <dl>
          {rows.map((row) => (
            <div key={row.key} className={`rail-stat ${row.tone === 'good' ? 'good' : ''}`} title={row.hint} data-stat={row.key}>
              <dt>{row.label}</dt>
              <dd><span>{row.value}</span>{row.visual}</dd>
            </div>
          ))}
        </dl>
        <p className="rail-live"><i aria-hidden="true" />{text.note}</p>
      </section>
      {second && <PhotoCard photo={second} delay={300} />}
    </aside>
  )
}
