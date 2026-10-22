import { Link } from 'react-router-dom'
import { DeleteOutlineRounded, EditRounded, OpenInNewRounded } from '@mui/icons-material'
import CellValue from './CellValue'
import { cellClass } from '../lib/tableCells'

/** Spreadsheet-style view of the drives (the old "Placements Table"). The company opens the drive. */
export default function DrivesTable({ drives, columns, onDelete }) {
  // Always spreadsheet style: one line per drive, the Actions column stays visible while scrolling sideways
  return <div className="data-table-wrap">
    <table className="data-table drives-table sheet-view">
      <thead><tr>{columns.map((column) => <th key={column.key} className={cellClass(column)}>{column.label}</th>)}<th className="action-col">Actions</th></tr></thead>
      <tbody>{drives.map((drive, rowIndex) => <tr key={drive.id}>
        {columns.map((column, columnIndex) => <td key={column.key} className={cellClass(column)}>
          {columnIndex === 0
            ? <Link className="cell-open" to={`/drives/${drive.id}`} title={`Open the ${drive[column.key] || ''} drive`}><CellValue column={column} row={drive} rowIndex={rowIndex} identity /></Link>
            : <CellValue column={column} row={drive} rowIndex={rowIndex} identity={false} />}
        </td>)}
        <td className="actions-cell">
          <Link className="table-icon-button" to={`/drives/${drive.id}`} aria-label={`Open ${drive.company || 'this'} drive`} title="Open"><OpenInNewRounded /></Link>
          <Link className="table-icon-button" to={`/drives/${drive.id}/edit`} aria-label={`Edit ${drive.company || 'this'} drive`} title="Edit"><EditRounded /></Link>
          <button type="button" className="table-icon-button danger" onClick={() => onDelete(drive)} aria-label={`Delete ${drive.company || 'this'} drive`} title="Delete"><DeleteOutlineRounded /></button>
        </td>
      </tr>)}</tbody>
    </table>
  </div>
}
