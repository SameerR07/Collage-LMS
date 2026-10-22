import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AddRounded, DeleteOutlineRounded, EditRounded, FileDownloadRounded, FileUploadRounded, RefreshRounded, SearchRounded, TuneRounded } from '@mui/icons-material'
import * as XLSX from 'xlsx'
import AppShell from '../components/AppShell'
import ImportDialog from '../components/ImportDialog'
import Modal from '../components/Modal'
import RecordFields from '../components/RecordFields'
import PageBanner from '../components/PageBanner'
import { entityConfigs } from '../config/modules'
import { addRecord, deleteRecord, listRecords, updateRecord } from '../lib/dataStore'
import CellValue from '../components/CellValue'
import { avatarTone, initials, statusClass } from '../lib/utils'
import { orderedFields, safeSheetName } from '../lib/importer'
import { blank, cellClass } from '../lib/tableCells'
import { logActivity } from '../lib/activity'
import { useToast } from '../context/ToastContext'

const initialForm = (fields) => fields.reduce((acc, field) => ({ ...acc, [field.key]: field.defaultValue || '' }), {})

const identityName = (row) => row.name || row.company || row.organization || row.speaker

// Export values: numbers stay numbers in Excel, everything else as text
const exportValue = (field, value) => {
  if (blank(value)) return ''
  if ((field.type === 'number' || field.type === 'percent') && Number.isFinite(Number(value))) return Number(value)
  return String(value)
}

export default function EntityPage({ kind }) {
  const config = entityConfigs[kind]
  const { push } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  // Opened straight from "Import students in bulk" on the Add Student page
  const [importOpen, setImportOpen] = useState(() => Boolean(location.state?.openImport))
  useEffect(() => { if (location.state?.openImport) navigate(location.pathname, { replace: true, state: null }) }, [location, navigate])
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('All'); const [modalOpen, setModalOpen] = useState(false); const [editingId, setEditingId] = useState(null); const [form, setForm] = useState(() => initialForm(config.fields)); const [saving, setSaving] = useState(false)

  // Master Data can show every column of the registration sheet or just the key ones (remembered per browser)
  const [view, setView] = useState(() => { try { return localStorage.getItem(`gjimt:lms:view:${kind}`) || 'all' } catch { return 'all' } })
  const changeView = (next) => { setView(next); try { localStorage.setItem(`gjimt:lms:view:${kind}`, next) } catch { /* storage unavailable — view just isn't remembered */ } }
  const visibleColumns = config.keyColumns && view === 'key' ? config.keyColumns.map((key) => config.columns.find((column) => column.key === key)).filter(Boolean) : config.columns
  const hasIdentityColumn = visibleColumns.some((column) => column.identity)
  const sheetView = visibleColumns.length > 10
  const mobileColumns = config.mobileColumns ? config.mobileColumns.map((key) => config.columns.find((column) => column.key === key)).filter(Boolean) : config.columns.slice(1, 5)
  const detailColumns = config.columns.filter((column) => column.format !== 'index' && !column.identity && column.format !== 'status')

  const load = async () => { setLoading(true); try { setRows(await listRecords(config.collection)) } catch (error) { push(error?.message || 'Could not load data.', 'error') } finally { setLoading(false) } }
  // First load; a result that arrives after leaving the page is ignored
  useEffect(() => {
    let active = true
    listRecords(config.collection)
      .then((records) => { if (active) setRows(records) })
      .catch((error) => { if (active) push(error?.message || 'Could not load data.', 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [config.collection, push])

  const statusOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map((row) => row.status || row.placementStatus).filter(Boolean)))], [rows])
  const statusField = config.fields.find((field) => field.key === 'status' || field.key === 'placementStatus')
  const statusTiles = (statusField?.options || []).map((option) => ({ label: option, value: loading ? '…' : rows.filter((row) => (row.status || row.placementStatus) === option).length }))
  const filteredRows = useMemo(() => { const term = search.trim().toLowerCase(); return rows.filter((row) => { const matchesSearch = !term || config.searchKeys.some((key) => String(row[key] ?? '').toLowerCase().includes(term)); const status = row.status || row.placementStatus; return matchesSearch && (statusFilter === 'All' || status === statusFilter) }) }, [rows, search, statusFilter, config])
  const openAdd = () => { setEditingId(null); setForm(initialForm(config.fields)); setModalOpen(true) }
  const openEdit = (row) => { setEditingId(row.id); setForm(config.fields.reduce((acc, field) => ({ ...acc, [field.key]: row[field.key] ?? '' }), {})); setModalOpen(true) }
  const submit = async (event) => { event.preventDefault(); setSaving(true); try { if (editingId) { const updated = await updateRecord(config.collection, editingId, form); setRows((current) => current.map((item) => item.id === editingId ? { ...item, ...updated } : item)); push(`${config.singular} updated successfully.`) } else { const added = await addRecord(config.collection, form); setRows((current) => [added, ...current]); push(`${config.singular} added successfully.`) } setModalOpen(false) } catch (error) { push(error?.message || 'Could not save this record.', 'error') } finally { setSaving(false) } }
  const remove = async (row) => { const name = row.name || row.company || row.organization || row.speaker || 'this record'; if (!window.confirm(`Delete ${name}? This action cannot be undone.`)) return; try { await deleteRecord(config.collection, row.id); setRows((current) => current.filter((item) => item.id !== row.id)); push(`${config.singular} deleted.`) } catch (error) { push(error?.message || 'Could not delete the record.', 'error') } }
  const exportExcel = () => {
    // Same headings and order as the table (for Master Data: the registration sheet's columns)
    const fields = orderedFields(config)
    const sheetRows = filteredRows.map((row) => Object.fromEntries(fields.map((field) => [field.label, exportValue(field, row[field.key])])))
    const ws = XLSX.utils.json_to_sheet(sheetRows, { header: fields.map((field) => field.label) })
    ws['!cols'] = fields.map((field) => ({ wch: Math.min(40, Math.max(10, field.label.length + 2, ...filteredRows.map((row) => String(row[field.key] ?? '').length + 2))) }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, safeSheetName(config.title))
    XLSX.writeFile(wb, `${config.collection}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    push('Excel export downloaded.', 'info')
    logActivity(`Downloaded ${config.title} Excel`, { area: config.title, category: 'download', detail: `${filteredRows.length} record${filteredRows.length === 1 ? '' : 's'}` })
  }
  const handleImported = (summary) => {
    load()
    if (!summary || summary.failed) return
    const parts = [summary.created && `${summary.created} added`, summary.updated && `${summary.updated} updated`].filter(Boolean)
    push(parts.length ? `Import complete — ${parts.join(', ')}.` : 'Import complete.')
  }
  const Icon = config.icon

  return <AppShell title={config.title} subtitle={config.eyebrow}><div className="page-stack">
    <PageBanner
      icon={Icon}
      eyebrow={config.eyebrow}
      title={config.title}
      description={config.description}
      back={{ to: '/', label: 'Dashboard' }}
      actions={<button className="primary-button" onClick={openAdd}><AddRounded /> Add {config.singular}</button>}
      tiles={[{ label: 'Total records', value: loading ? '…' : rows.length }, ...statusTiles]}
    />
    <div className="toolbar-card"><div className="toolbar-search"><SearchRounded /><input placeholder={`Search ${config.title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="toolbar-actions"><div className="filter-select"><TuneRounded /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></div><button className="soft-button" onClick={load}><RefreshRounded /> Refresh</button><button className="soft-button" onClick={() => setImportOpen(true)}><FileUploadRounded /> Import</button><button className="soft-button" onClick={exportExcel}><FileDownloadRounded /> Export</button></div></div>
    <div className="table-card"><div className="table-card-head"><div><strong>{filteredRows.length}</strong> {filteredRows.length === 1 ? 'record' : 'records'} visible{statusFilter !== 'All' && <span className="filter-tag">{statusFilter}</span>}</div><div className="table-head-tools">{sheetView && <span className="scroll-hint">Scroll sideways for all {visibleColumns.length} columns →</span>}{config.keyColumns && <div className="view-toggle" role="radiogroup" aria-label="Columns to show"><button type="button" role="radio" aria-checked={view !== 'key'} className={view !== 'key' ? 'active' : ''} onClick={() => changeView('all')}>All columns</button><button type="button" role="radio" aria-checked={view === 'key'} className={view === 'key' ? 'active' : ''} onClick={() => changeView('key')}>Key columns</button></div>}{!config.keyColumns && <span>Edit or delete from the actions column.</span>}</div></div>{loading ? <div className="skeleton-table" aria-busy="true" aria-label="Loading records">{Array.from({ length: 5 }).map((_, index) => <div className="skeleton-row" key={index}><span className="skeleton-avatar" /><span className="skeleton-line wide" /><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-pill" /></div>)}</div> : filteredRows.length === 0 ? <div className="empty-state"><span className="empty-art"><Icon /></span><h3>No records found</h3><p>Change your search/filter, add your first record, or import a spreadsheet.</p><div className="empty-actions"><button className="primary-button" onClick={openAdd}><AddRounded /> Add {config.singular}</button><button className="soft-button" onClick={() => setImportOpen(true)}><FileUploadRounded /> Import from Excel</button></div></div> : <div className="data-table-wrap">
      <table className={`data-table ${sheetView ? 'sheet-view' : ''}`}><thead><tr>{visibleColumns.map((column) => <th key={column.key} className={cellClass(column)}>{column.label}</th>)}<th className="action-col">Actions</th></tr></thead><tbody>{filteredRows.map((row, rowIndex) => <tr key={row.id}>{visibleColumns.map((column, columnIndex) => <td key={column.key} className={cellClass(column)}><CellValue column={column} row={row} rowIndex={rowIndex} identity={column.identity || (!hasIdentityColumn && columnIndex === 0)} /></td>)}<td className="actions-cell"><button className="table-icon-button" onClick={() => openEdit(row)} aria-label="Edit record"><EditRounded /></button><button className="table-icon-button danger" onClick={() => remove(row)} aria-label="Delete record"><DeleteOutlineRounded /></button></td></tr>)}</tbody></table>
      <div className="mobile-table-cards">{filteredRows.map((row) => <article className="mobile-record" key={row.id}><div className="mobile-record-head"><span className="cell-identity"><span className={`avatar-chip ${avatarTone(identityName(row))}`}>{initials(identityName(row))}</span><strong>{identityName(row)}</strong></span><span className={`status-badge ${statusClass(row.status || row.placementStatus)}`}><i />{row.status || row.placementStatus}</span></div>{mobileColumns.map((column) => <div className="mobile-row" key={column.key}><span>{column.label}</span><strong><CellValue column={column} row={row} rowIndex={0} identity={false} /></strong></div>)}{detailColumns.length > 8 && <details className="mobile-details"><summary>All details</summary>{detailColumns.filter((column) => !mobileColumns.includes(column)).map((column) => <div className="mobile-row" key={column.key}><span>{column.label}</span><strong><CellValue column={column} row={row} rowIndex={0} identity={false} /></strong></div>)}</details>}<div className="mobile-record-actions"><button className="soft-button" onClick={() => openEdit(row)}><EditRounded /> Edit</button><button className="soft-button danger-text" onClick={() => remove(row)}><DeleteOutlineRounded /> Delete</button></div></article>)}</div>
    </div>}</div>
  </div><Modal open={modalOpen} onClose={() => setModalOpen(false)} eyebrow={editingId ? `Edit record · ${config.title}` : `New record · ${config.title}`} title={editingId ? `Edit ${config.singular}` : `Add ${config.singular}`} description="Fill the core details below. You can edit them later." width={config.groups ? '860px' : '720px'}><form onSubmit={submit}><RecordFields config={config} values={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} /><div className="modal-actions"><button type="button" className="soft-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create record'}</button></div></form></Modal><ImportDialog key={kind} open={importOpen} config={config} existingRows={rows} onClose={() => setImportOpen(false)} onImported={handleImported} /></AppShell>
}
