import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { CheckCircleRounded, CloudUploadRounded, DownloadRounded, ErrorOutlineRounded, InsertDriveFileRounded, RestartAltRounded, TaskAltRounded, WarningAmberRounded } from '@mui/icons-material'
import Modal from './Modal'
import { importRecords } from '../lib/dataStore'
import { ACCEPTED_EXTENSIONS, analyseRows, buildProblemsWorkbook, buildTemplateWorkbook, fieldsNeedingDefaults, mapColumns, normKey, pickSheet, readWorkbook, sheetToTable } from '../lib/importer'
import { formatDate } from '../lib/utils'
import { seedData } from '../data/seedData'

const RESULT_LABEL = { add: 'New', update: 'Update', skip: 'Skipped', error: 'Needs fixing' }
const PREVIEW_LIMIT = 200

/**
 * Bulk import from Excel / CSV for any module.
 * Steps: pick a file → review (columns, blanks, duplicates, problems) → save → done.
 */
export default function ImportDialog({ open, config, existingRows = [], onClose, onImported }) {
  const inputRef = useRef(null)
  const [step, setStep] = useState('pick')
  const [file, setFile] = useState(null)
  const [book, setBook] = useState(null)
  const [sheetName, setSheetName] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [defaults, setDefaults] = useState({})
  const [mode, setMode] = useState('skip')
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

  const table = useMemo(() => (book && sheetName ? sheetToTable(book.workbook.Sheets[sheetName], config) : null), [book, sheetName, config])
  const columns = useMemo(() => (table ? mapColumns(table.headers, config) : null), [table, config])
  const fillable = useMemo(() => (table && columns ? fieldsNeedingDefaults(table, columns.mapping, config, { date1904: book?.date1904 }) : []), [table, columns, config, book])
  const analysis = useMemo(
    () => (table && columns ? analyseRows({ table, mapping: columns.mapping, config, existingRows, defaults, mode, date1904: book?.date1904 }) : null),
    [table, columns, config, existingRows, defaults, mode, book],
  )

  const previewColumns = (config.keyColumns ? config.keyColumns.map((key) => config.columns.find((column) => column.key === key)).filter(Boolean) : config.columns)
    .filter((column) => column.format !== 'status' && column.format !== 'index').slice(0, 4)
  const uniqueLabels = (config.uniqueBy || []).map((key) => config.fields.find((field) => field.key === key)?.label || key).join(' + ')
  const counts = analysis?.counts || { add: 0, update: 0, skip: 0, error: 0 }
  const importable = counts.add + counts.update
  const visibleRows = (analysis?.items || []).filter((item) => !problemsOnly || item.status === 'error')

  const reset = () => {
    setStep('pick'); setFile(null); setBook(null); setSheetName(''); setError(''); setReading(false)
    setDefaults({}); setMode('skip'); setProblemsOnly(false); setProgress(0); setResult(null)
  }
  const close = () => { if (step === 'saving') return; reset(); onClose() }

  const handleFile = async (picked) => {
    if (!picked) return
    setError(''); setReading(true)
    try {
      const loaded = await readWorkbook(picked)
      const chosen = pickSheet(loaded.sheetNames, config)
      const firstTable = sheetToTable(loaded.workbook.Sheets[chosen], config)
      if (!firstTable.rows.length) throw new Error('No data rows were found under the column names. Fill in at least one row and try again.')
      setFile(picked); setBook(loaded); setSheetName(chosen); setDefaults({}); setStep('review')
    } catch (err) {
      setError(err.message || 'This file could not be read.')
    } finally {
      setReading(false)
    }
  }

  const downloadTemplate = () => XLSX.writeFile(buildTemplateWorkbook(config, seedData[config.collection]?.[0]), `${config.collection}-import-template.xlsx`)
  const downloadProblems = () => XLSX.writeFile(buildProblemsWorkbook(analysis.items, table.headers), `${config.collection}-rows-to-fix.xlsx`)

  const runImport = async () => {
    const creates = analysis.items.filter((item) => item.status === 'add').map((item) => item.data)
    const updates = analysis.items.filter((item) => item.status === 'update').map((item) => ({ id: item.matchId, changes: item.changes }))
    setError(''); setStep('saving'); setProgress(0)
    try {
      const saved = await importRecords(config.collection, { creates, updates }, (done, total) => setProgress(total ? Math.round((done / total) * 100) : 100))
      const summary = { ...saved, skipped: counts.skip, problems: counts.error }
      setResult(summary)
      setStep('done')
      onImported?.(summary)
    } catch (err) {
      setError(`The import stopped${err?.message ? `: ${err.message}` : ''}. Rows already saved will show as “Skipped” if you try again.`)
      setStep('review')
      onImported?.({ failed: true })
    }
  }

  const importLabel = counts.update && counts.add ? `Add ${counts.add} · Update ${counts.update}` : counts.update ? `Update ${counts.update} ${counts.update === 1 ? 'record' : 'records'}` : `Import ${counts.add} ${counts.add === 1 ? 'record' : 'records'}`

  return (
    <Modal open={open} onClose={close} eyebrow={`Bulk upload · ${config.title}`} title={`Import ${config.title}`} description="Add many records at once from an Excel or CSV file. Nothing is saved until you confirm." width="980px">
      {step === 'pick' && <div className="import-pick">
        <div
          className={`dropzone ${dragging ? 'is-dragging' : ''} ${reading ? 'is-reading' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); handleFile(event.dataTransfer.files?.[0]) }}
        >
          <span className="dropzone-icon"><CloudUploadRounded /></span>
          <strong>{reading ? 'Reading your file…' : 'Drag & drop your Excel or CSV file here'}</strong>
          <span className="dropzone-or">or</span>
          <button type="button" className="primary-button" onClick={() => inputRef.current?.click()} disabled={reading}><InsertDriveFileRounded /> Browse files</button>
          <small>{ACCEPTED_EXTENSIONS.join(', ')} · up to 5 MB · first row should be the column names</small>
          <input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ''; handleFile(picked) }} />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="import-template">
          <div>
            <strong>Not sure about the format?</strong>
            <p>Download the ready-made template, fill it in, and import it back. Column order doesn’t matter, and common names like “Roll No”, “Mobile” or “Package” are recognised. Files exported from this page import straight back.</p>
          </div>
          <button type="button" className="soft-button" onClick={downloadTemplate}><DownloadRounded /> Download template</button>
        </div>
        <div className="import-columns">
          <span>Columns for {config.title}</span>
          <div className="chip-row">{config.fields.map((field) => <span key={field.key} className={`field-chip ${field.required ? 'required' : ''}`}>{field.label.replace(' (optional)', '')}{field.required ? ' *' : ''}</span>)}</div>
        </div>
      </div>}

      {(step === 'review' || step === 'saving') && analysis && <div className="import-review">
        <div className="import-file-bar">
          <span className="file-icon"><InsertDriveFileRounded /></span>
          <div className="file-meta"><strong>{file?.name}</strong><span>{table.rows.length} data {table.rows.length === 1 ? 'row' : 'rows'} · column names on row {table.headerRowNumber}</span></div>
          {book.sheetNames.length > 1 && <label className="sheet-select"><span>Sheet</span><select value={sheetName} onChange={(event) => { setSheetName(event.target.value); setDefaults({}) }} disabled={step === 'saving'}>{book.sheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>}
          <button type="button" className="soft-button" onClick={reset} disabled={step === 'saving'}><RestartAltRounded /> Choose another file</button>
        </div>

        {analysis.blockers.length > 0 && <div className="import-alert danger" role="alert"><ErrorOutlineRounded /><div><strong>This file can’t be imported yet</strong>{analysis.blockers.map((message) => <p key={message}>{message}</p>)}<p>Add or rename that column in your file (the template shows the exact names), then choose the file again.</p></div></div>}

        <section className="import-section">
          <h4>Column matching</h4>
          <div className="chip-row">{config.fields.map((field) => {
            const index = columns.mapping[field.key]
            const matched = index !== undefined
            const filled = !matched && Boolean(defaults[field.key])
            const header = matched ? table.headers[index] : ''
            const state = matched ? 'ok' : filled ? 'filled' : field.required ? 'missing' : 'absent'
            const hint = matched ? `Read from column “${header}”` : filled ? `Every row set to ${defaults[field.key]}` : field.required ? 'Required column not found' : 'Optional — not in this file'
            return <span key={field.key} className={`match-chip ${state}`} title={hint}>
              {matched || filled ? <CheckCircleRounded /> : <WarningAmberRounded />}{field.label.replace(' (optional)', '')}
              {matched && normKey(header) !== normKey(field.label) && normKey(header) !== normKey(field.key) && <em>← “{header}”</em>}
              {filled && <em>= {defaults[field.key]}</em>}
            </span>
          })}</div>
          {columns.ignored.length > 0 && <p className="import-note">Not used: {columns.ignored.map((header) => `“${header}”`).join(', ')}</p>}
        </section>

        {fillable.length > 0 && <section className="import-section">
          <h4>Fill empty values</h4>
          <div className="defaults-grid">{fillable.map((field) => <label key={field.key} className={`form-control ${defaults[field.key] ? '' : 'needs-choice'}`}>
            <span>{field.deriveWhenBlank ? `Other rows without a ${field.label} get` : columns.mapping[field.key] === undefined ? `No “${field.label}” column — set every row to` : `Rows with an empty ${field.label} get`}</span>
            <select value={defaults[field.key] || ''} onChange={(event) => setDefaults((current) => ({ ...current, [field.key]: event.target.value }))} disabled={step === 'saving'}>
              <option value="">Choose a value…</option>
              {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {field.deriveNote && <small className="field-note">{field.deriveNote}</small>}
          </label>)}</div>
        </section>}

        <section className="import-section">
          <h4>If a record already exists <small>matched by {uniqueLabels}</small></h4>
          <div className="segmented" role="radiogroup" aria-label="When a record already exists">
            <button type="button" role="radio" aria-checked={mode === 'skip'} className={mode === 'skip' ? 'active' : ''} onClick={() => setMode('skip')} disabled={step === 'saving'}><strong>Skip it</strong><span>Keep what is already in the LMS</span></button>
            <button type="button" role="radio" aria-checked={mode === 'update'} className={mode === 'update' ? 'active' : ''} onClick={() => setMode('update')} disabled={step === 'saving'}><strong>Update it</strong><span>Use the values from the file (blank cells never erase data)</span></button>
          </div>
        </section>

        <div className="import-summary">
          <div className="sum add"><strong>{counts.add}</strong><span>New records</span></div>
          <div className="sum update"><strong>{counts.update}</strong><span>Will update</span></div>
          <div className="sum skip"><strong>{counts.skip}</strong><span>Skipped (already there / repeated)</span></div>
          <div className="sum error"><strong>{counts.error}</strong><span>Need fixing</span></div>
        </div>

        {analysis.items.some((item) => item.status !== 'error' && item.warnings?.length) && <p className="import-note warn">{analysis.items.filter((item) => item.status !== 'error' && item.warnings?.length).length} row(s) will import but have something worth checking — see the Details column.</p>}
        <div className="import-table-head">
          <strong>Preview</strong>
          <label><input type="checkbox" checked={problemsOnly} onChange={(event) => setProblemsOnly(event.target.checked)} /> Show only rows that need fixing</label>
        </div>
        <div className="import-table-wrap">
          <table className="data-table import-table">
            <thead><tr><th>Row</th><th>Result</th>{previewColumns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Details</th></tr></thead>
            <tbody>{visibleRows.slice(0, PREVIEW_LIMIT).map((item) => <tr key={item.rowNumber} className={`import-row ${item.status}`}>
              <td className="num">{item.rowNumber}</td>
              <td><span className={`import-pill ${item.status}`}>{RESULT_LABEL[item.status]}</span></td>
              {previewColumns.map((column) => <td key={column.key}>{item.data[column.key] ? (column.format === 'date' ? formatDate(item.data[column.key]) : item.data[column.key]) : <span className="muted">—</span>}</td>)}
              <td className="details">{item.errors.length ? item.errors.join(' · ') : <>{item.note || 'Ready to import'}{item.warnings?.map((warning) => <span key={warning} className="row-warning">{warning}</span>)}</>}</td>
            </tr>)}
            {!visibleRows.length && <tr><td colSpan={previewColumns.length + 3} className="muted center">No rows need fixing.</td></tr>}</tbody>
          </table>
        </div>
        {visibleRows.length > PREVIEW_LIMIT && <p className="import-note">Showing the first {PREVIEW_LIMIT} of {visibleRows.length} rows — all of them will be processed.</p>}
        {analysis.truncated && <p className="import-note warn">This file has more than 5,000 rows. Only the first 5,000 will be imported — split the file and import the rest separately.</p>}
        {error && <div className="form-error" role="alert">{error}</div>}

        {step === 'saving'
          ? <div className="import-progress" aria-live="polite"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><span>Saving… {progress}%</span></div>
          : <div className="modal-actions import-actions">
            {counts.error > 0 && <button type="button" className="soft-button" onClick={downloadProblems}><DownloadRounded /> Download rows to fix</button>}
            <span className="spacer" />
            <button type="button" className="soft-button" onClick={close}>Cancel</button>
            <button type="button" className="primary-button" disabled={!importable} onClick={runImport}><CloudUploadRounded /> {importable ? importLabel : 'Nothing to import'}</button>
          </div>}
      </div>}

      {step === 'done' && result && <div className="import-done">
        <span className="done-icon"><TaskAltRounded /></span>
        <h3>Import complete</h3>
        <div className="import-summary compact">
          <div className="sum add"><strong>{result.created}</strong><span>Added</span></div>
          <div className="sum update"><strong>{result.updated}</strong><span>Updated</span></div>
          <div className="sum skip"><strong>{result.skipped}</strong><span>Skipped</span></div>
          <div className="sum error"><strong>{result.problems}</strong><span>Not imported (need fixing)</span></div>
        </div>
        {result.problems > 0 && <p className="import-note">Download the rows that need fixing, correct them in Excel and import that file again — rows already imported will be skipped automatically.</p>}
        <div className="modal-actions import-actions">
          {result.problems > 0 && <button type="button" className="soft-button" onClick={downloadProblems}><DownloadRounded /> Download rows to fix</button>}
          <span className="spacer" />
          <button type="button" className="soft-button" onClick={reset}><RestartAltRounded /> Import another file</button>
          <button type="button" className="primary-button" onClick={close}>Done</button>
        </div>
      </div>}
    </Modal>
  )
}
