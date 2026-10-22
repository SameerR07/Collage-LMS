// Import engine checks — run with:  npm test
import * as XLSX from 'xlsx'
import assert from 'node:assert/strict'
import { orderedFields, safeSheetName, readWorkbook, pickSheet, sheetToTable, mapColumns, analyseRows, fieldsNeedingDefaults, buildTemplateWorkbook, buildProblemsWorkbook, cleanDate, cleanValue } from '../frontend/src/lib/importer.js'
import { entityConfigs } from '../frontend/src/config/modules.js'
import { seedData } from '../frontend/src/data/seedData.js'
import { flattenForExport } from '../frontend/src/lib/utils.js'

let passed = 0
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name) } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1 } }
const xlsxFile = (wb, name) => new File([XLSX.write(wb, { type: 'array', bookType: name.endsWith('.xls') ? 'biff8' : 'xlsx' })], name)
const csvFile = (text, name = 'data.csv') => new File([text], name)
async function run(file, config, opts = {}) {
  const { workbook, sheetNames } = await readWorkbook(file)
  const sheetName = pickSheet(sheetNames, config)
  const table = sheetToTable(workbook.Sheets[sheetName], config)
  const { mapping, ignored, missing } = mapColumns(table.headers, config)
  const result = analyseRows({ table, mapping, config, ...opts })
  return { table, mapping, ignored, missing, sheetName, ...result }
}
const withIds = (rows) => rows.map((r, i) => ({ id: `id${i}`, createdAt: '2026-01-01', ...r }))

console.log('Round trip: Export → Import for every section')
for (const [kind, config] of Object.entries(entityConfigs)) {
  const rows = withIds(seedData[config.collection])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flattenForExport(rows)), safeSheetName(config.title))
  await test(`${kind}: exported file imports cleanly as new records`, async () => {
    const r = await run(xlsxFile(wb, `${kind}.xlsx`), config)
    assert.equal(r.counts.error, 0, JSON.stringify(r.items.filter(i => i.errors.length).map(i => i.errors)))
    assert.equal(r.counts.add, rows.length)
    assert.deepEqual(r.ignored, [])
    r.items.forEach((item, i) => config.fields.forEach((f) => assert.equal(item.data[f.key] ?? '', String(rows[i][f.key] ?? ''), `${f.key}`)))
  })
  await test(`${kind}: export with readable headings imports back`, async () => {
    const fields = orderedFields(config)
    const labelled = XLSX.utils.json_to_sheet(rows.map((row) => Object.fromEntries(fields.map((f) => [f.label, row[f.key] ?? '']))), { header: fields.map((f) => f.label) })
    const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, labelled, safeSheetName(config.title))
    const r = await run(xlsxFile(wb2, `${kind}-labels.xlsx`), config)
    assert.equal(r.counts.add, rows.length); assert.equal(r.counts.error, 0); assert.deepEqual(r.missing.map((f) => f.key), [])
  })
  await test(`${kind}: re-importing the same file skips everything`, async () => {
    const r = await run(xlsxFile(wb, `${kind}.xlsx`), config, { existingRows: rows })
    assert.equal(r.counts.skip, rows.length); assert.equal(r.counts.add, 0)
  })
  await test(`${kind}: update mode updates matching records`, async () => {
    const r = await run(xlsxFile(wb, `${kind}.xlsx`), config, { existingRows: rows, mode: 'update' })
    assert.equal(r.counts.update, rows.length)
    assert.deepEqual(r.items.map(i => i.matchId), rows.map(x => x.id))
  })
  await test(`${kind}: template file (with sample row) imports`, async () => {
    const r = await run(xlsxFile(buildTemplateWorkbook(config, seedData[config.collection][0]), 't.xlsx'), config)
    assert.equal(r.counts.add, 1); assert.equal(r.counts.error, 0)
  })
}

console.log('Real-world student sheet (CSV, labels, Indian formats)')
const students = entityConfigs.students
await test('title row above headers, aliases, lowercase statuses, +91 phones, defaults for missing status', async () => {
  const csv = [
    'GJIMT — Final year list,,,,,,',
    'Student Name,Roll No.,Program,Session,Email ID,Mobile No,CGPA',
    'Neha Gupta,BCA23040,bca,2023-26,Neha.Gupta@Demo.edu,+91 98765 11111,8.4',
    'Arjun Mehta,MBA24011,MBA,2024-26,arjun@demo.edu,098765 22222,7',
    ',,,,,,',
    'Arjun Mehta,MBA24011,MBA,2024-26,arjun@demo.edu,9876522222,7',
  ].join('\n')
  const file = csvFile(csv, 'final-year.csv')
  const { workbook, sheetNames } = await readWorkbook(file)
  const table = sheetToTable(workbook.Sheets[sheetNames[0]], students)
  assert.equal(table.headerRowNumber, 2)
  const { mapping, missing } = mapColumns(table.headers, students)
  assert.deepEqual(missing.filter(f => f.required).map(f => f.key), ['placementStatus'])
  const needing = fieldsNeedingDefaults(table, mapping, students).map(f => f.key)
  assert.deepEqual(needing, ['placementStatus'])
  const blocked = analyseRows({ table, mapping, config: students })
  assert.equal(blocked.counts.error, 3)
  const r = analyseRows({ table, mapping, config: students, defaults: { placementStatus: 'Eligible' } })
  assert.equal(r.counts.add, 2); assert.equal(r.counts.skip, 1)
  assert.equal(r.items[2].note, 'Repeats row 4 of this file')
  const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
  assert.deepEqual(pick(r.items[0].data, ['name', 'rollNo', 'course', 'batch', 'email', 'phone', 'cgpa', 'placementStatus', 'company']), { name: 'Neha Gupta', rollNo: 'BCA23040', course: 'BCA', batch: '2023-26', email: 'neha.gupta@demo.edu', phone: '9876511111', cgpa: '8.4', placementStatus: 'Eligible', company: '' })
  assert.equal(r.items[1].data.phone, '9876522222')
  assert.equal(r.items[0].rowNumber, 3)
})
await test('clear errors for bad values', async () => {
  const csv = 'Name,Roll number,Course,Batch,Email,Phone,CGPA,Placement status\n' +
    'A,R1,BTech,2023-26,bad-email,123,11,Placed\n' +
    'B,R2,BCA,2023-26,b@x.in,9876500000,abc,Hired\n'
  const r = await run(csvFile(csv), students)
  assert.equal(r.counts.error, 2)
  const e1 = r.items[0].errors.join(' | '); const e2 = r.items[1].errors.join(' | ')
  assert.match(e1, /Course "BTech" is not allowed/); assert.match(e1, /Email "bad-email"/); assert.match(e1, /Phone "123"/); assert.match(e1, /CGPA cannot be more than 10/)
  assert.match(e2, /CGPA must be a number/); assert.match(e2, /Placement Status "Hired" is not allowed/)
  const wb = buildProblemsWorkbook(r.items, r.table.headers)
  const out = XLSX.utils.sheet_to_json(wb.Sheets['Rows to fix'], { header: 1 })
  assert.equal(out.length, 3); assert.equal(out[1][0], 2)
})
await test('missing required text column blocks import with a clear message', async () => {
  const r = await run(csvFile('Name,Course,Batch,Email,Phone,Placement status\nA,BCA,2023-26,a@b.in,9876500000,Placed\n'), students)
  assert.deepEqual(r.blockers, ['The file has no "Uni. Roll No." column.'])
  assert.equal(r.counts.error, 1)
})
await test('update mode never wipes existing values with blanks', async () => {
  const existing = [{ id: 'x1', name: 'Old', rollNo: 'BCA1', course: 'BCA', batch: '2023-26', email: 'o@x.in', phone: '9876500000', cgpa: '8', placementStatus: 'Eligible', company: '' }]
  const r = await run(csvFile('Roll No,Name,Course,Batch,Email,Phone,Placement status,Company,CGPA\nbca1,New Name,BCA,2023-26,o@x.in,9876500000,Placed,TechNova,\n'), students, { existingRows: existing, mode: 'update' })
  assert.equal(r.counts.update, 1); assert.equal(r.items[0].matchId, 'x1')
  assert.equal(r.items[0].changes.cgpa, undefined); assert.equal(r.items[0].changes.company, 'TechNova'); assert.equal(r.items[0].changes.rollNo, undefined)
})

console.log('College registration sheet (MCA format — synthetic rows)')
await test('registration sheet: headers, % fractions, interest → Opted Out, typo warning, missing contact', async () => {
  const headers = ['Batch', 'Uni. Roll No.', 'Name', "Father's Name", 'Email_ID', 'Phone_Number_1', 'Phone_Number_2', 'Address', 'State', 'Course', 'Gradutation_done', 'Degree_Name', 'Specialization', '10th_Marks', '12th_Marks', 'Graduation_Marks ', 'Intersested', 'Location Preference - Choice 1', 'Location Preference - Choice 2', 'Location Preference - Choice 3', 'Job_Area_1', 'Job_Area_2', 'Job_Area_3']
  const ws = XLSX.utils.aoa_to_sheet([
    ['MCA Batch 2025-2027'], headers,
    ['2025-27', 1000001, 'Test Student A', 'Parent A ', 'a.student@gamil.com', 9000000001, ' 90000 00002', 'House 1, Mohali ', 'Punjab', 'MCA', 'Yes', 'BCA', 'Full Stack ', 0.51, 0.684, 0.7, 'Yes', 'tricity', 'Delhi', 'Pune', 'Full Stack', 'Data Analyst', null],
    ['2025-27', 1000002, 'Test Student B', 'Parent B', 'b@example.com', 9000000003, null, 'Kharar', 'Punjab', 'MCA', 'Yes', 'BCA', 'Python', '76%', 82, 0.8, 'no ', null, null, null, null, null, null],
    ['2025-27', 1000003, 'Test Student C', null, null, null, null, null, null, 'MCA', 'Yes', 'BCA', null, null, null, null, null, null, null, null, null, null, null],
  ])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Registration'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Field', 'Requirement']]), 'Instructions')
  const { workbook, sheetNames } = await readWorkbook(xlsxFile(wb, 'reg.xlsx'))
  const sheet = pickSheet(sheetNames, students); assert.equal(sheet, 'Registration')
  const table = sheetToTable(workbook.Sheets[sheet], students); assert.equal(table.headerRowNumber, 2)
  const { mapping, ignored, missing } = mapColumns(table.headers, students)
  assert.deepEqual(ignored, []); assert.deepEqual(missing.map(f => f.key).sort(), ['cgpa', 'company', 'placementStatus'])
  const needing = fieldsNeedingDefaults(table, mapping, students).map(f => f.key)
  assert.deepEqual(needing, ['placementStatus'], 'rows A and C still need a status; B is derived')
  const r = analyseRows({ table, mapping, config: students, defaults: { placementStatus: 'Eligible' } })
  const [a, b, c] = r.items
  assert.equal(a.status, 'add'); assert.equal(b.status, 'add'); assert.equal(c.status, 'error')
  assert.deepEqual(c.errors, ['Email ID is missing', 'Phone Number 1 is missing'])
  assert.equal(a.data.rollNo, '1000001'); assert.equal(a.data.fatherName, 'Parent A'); assert.equal(a.data.altPhone, '9000000002'); assert.equal(a.data.address, 'House 1, Mohali')
  assert.deepEqual([a.data.tenthPercent, a.data.twelfthPercent, a.data.graduationPercent], ['51', '68.4', '70'])
  assert.deepEqual([b.data.tenthPercent, b.data.twelfthPercent, b.data.graduationPercent], ['76', '82', '80'])
  assert.equal(a.data.placementInterest, 'Yes'); assert.equal(a.data.placementStatus, 'Eligible')
  assert.equal(b.data.placementInterest, 'No'); assert.equal(b.data.placementStatus, 'Opted Out')
  assert.equal(a.data.locationPref1, 'tricity'); assert.equal(a.data.jobArea2, 'Data Analyst'); assert.equal(a.data.specialization, 'Full Stack')
  assert.match(a.warnings[0], /gamil\.com.*gmail\.com/)
  assert.equal(a.data.graduationDegree, 'BCA'); assert.equal(a.data.graduationDone, 'Yes'); assert.equal(a.data.batch, '2025-27'); assert.equal(a.data.state, 'Punjab')
})
await test('percentages: fractions, % signs, out of range', () => {
  const f = { label: '10th %', type: 'percent' }
  assert.deepEqual(cleanValue(f, 0.78), { value: '78' }); assert.deepEqual(cleanValue(f, '78%'), { value: '78' }); assert.deepEqual(cleanValue(f, 78.25), { value: '78.3' })
  assert.deepEqual(cleanValue(f, '0.5%'), { value: '0.5' }); assert.match(cleanValue(f, 120).error, /between 0 and 100/); assert.match(cleanValue(f, 'eighty').error, /percentage/)
})

console.log('Date formats')
await test('dates: ISO, Indian day-first, month names, Excel serials, invalid', () => {
  const cases = [['2026-10-08', '2026-10-08'], ['08/10/2026', '2026-10-08'], ['8-10-2026', '2026-10-08'], ['08.10.26', '2026-10-08'], ['10/25/2026', '2026-10-25'],
    ['8 Oct 2026', '2026-10-08'], ['8th October 2026', '2026-10-08'], ['Oct 8, 2026', '2026-10-08'], ['08-Oct-2026', '2026-10-08'], [46303, '2026-10-08'], ['46303', '2026-10-08'],
    ['31/02/2026', null], ['2026-13-01', null], ['tomorrow', null], ['', null]]
  for (const [input, expected] of cases) assert.equal(cleanDate(input), expected, `cleanDate(${JSON.stringify(input)})`)
})
await test('Excel file with real date cells, numeric phone and roll numbers', async () => {
  const config = entityConfigs.placements
  const ws = XLSX.utils.aoa_to_sheet([['Company', 'Drive date', 'Role', 'Package', 'Eligibility', 'Status'], ['Zeta Corp', new Date(2026, 10, 3), 'Analyst', 450000, 'BCA', 'scheduled']], { cellDates: true })
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Drives')
  const r = await run(xlsxFile(wb, 'drives.xlsx'), config)
  assert.equal(r.counts.add, 1, JSON.stringify(r.items[0].errors))
  // older drive files (no venue, rounds… columns) still import; the new details stay blank
  const given = ['company', 'driveDate', 'role', 'ctc', 'eligible', 'status']
  const blanks = Object.fromEntries(config.fields.map((field) => field.key).filter((key) => !given.includes(key)).map((key) => [key, '']))
  assert.deepEqual(r.items[0].data, { company: 'Zeta Corp', driveDate: '2026-11-03', role: 'Analyst', ctc: '450000', eligible: 'BCA', status: 'Scheduled', ...blanks })
})
await test('full report workbook: picks the matching sheet', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seedData.students), 'Students')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seedData.placements), 'Placements')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seedData.internships), 'Internships')
  const r = await run(xlsxFile(wb, 'report.xlsx'), entityConfigs.placements)
  assert.equal(r.sheetName, 'Placements'); assert.equal(r.counts.add, seedData.placements.length)
})
await test('.xls (old Excel) files are read', async () => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seedData.visits), 'Visits')
  const r = await run(xlsxFile(wb, 'visits.xls'), entityConfigs.visits)
  assert.equal(r.counts.add, seedData.visits.length)
})
await test('rejects unsupported, empty and oversized files', async () => {
  await assert.rejects(readWorkbook(new File(['x'], 'notes.pdf')), /not a supported file/)
  await assert.rejects(readWorkbook(new File([], 'a.csv')), /empty/)
  await assert.rejects(readWorkbook({ name: 'big.xlsx', size: 6 * 1024 * 1024 }), /under 5 MB/)
})
console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`)
