import { safeUrl } from '../lib/driveEmail'
import { blank } from '../lib/tableCells'
import { avatarTone, formatDate, initials, statusClass } from '../lib/utils'

// One table cell — formats follow the column config (index, status, date, percent, yes/no, link)
export default function CellValue({ column, row, rowIndex, identity }) {
  const value = row[column.key]
  if (column.format === 'index') return rowIndex + 1
  if (identity) return <span className="cell-identity"><span className={`avatar-chip ${avatarTone(value)}`}>{initials(value)}</span><strong>{value || '—'}</strong></span>
  if (column.format === 'status') return <span className={`status-badge ${statusClass(value)}`}><i />{value || '—'}</span>
  if (blank(value)) return <span className="muted">—</span>
  if (column.format === 'date') return formatDate(value)
  if (column.format === 'percent') return `${value}%`
  if (column.format === 'yesno') return <span className={`yesno ${value === 'Yes' ? 'yes' : 'no'}`}>{value}</span>
  if (column.format === 'link') {
    const url = safeUrl(value)
    return url ? <a className="cell-link" href={url} target="_blank" rel="noopener noreferrer" title={url}>{url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 36)}{url.length > 44 ? '…' : ''}</a> : value
  }
  return value
}
