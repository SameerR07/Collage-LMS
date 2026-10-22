import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowBackRounded, ArrowForwardRounded, CheckCircleRounded, FileUploadRounded, PersonAddAlt1Rounded, SaveRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import RecordFields from '../components/RecordFields'
import { entityConfigs } from '../config/modules'
import { addRecord } from '../lib/dataStore'
import { useToast } from '../context/ToastContext'

const studentConfig = entityConfigs.students
// Every student field starts empty, with sensible picks for course, batch and status
const defaults = { ...Object.fromEntries(studentConfig.fields.map((field) => [field.key, ''])), course: 'BCA', batch: '2023-26', placementStatus: 'Eligible' }

export default function AddStudent() {
  const navigate = useNavigate(); const { push } = useToast(); const [form, setForm] = useState(defaults); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(null)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => { event.preventDefault(); setSaving(true); try { const student = await addRecord('students', form); setSaved(student); push('Student record added successfully.') } catch (error) { push(error?.message || 'Could not add the student.', 'error') } finally { setSaving(false) } }
  return <AppShell title="Add Student Data" subtitle="Master Data"><div className="page-stack">
    <div className="split-card">
      <aside className="split-showcase">
        <Link to="/students" className="banner-back"><ArrowBackRounded /> Master Data</Link>
        <div className="split-showcase-copy">
          <span className="banner-kicker"><PersonAddAlt1Rounded /> Student database</span>
          <h2>Add Student <em>Data</em></h2>
          <p>Create a complete placement-ready profile in one step. Good master data keeps eligibility checks, placement lists and reports accurate.</p>
        </div>
        <div className="split-highlights">
          {studentConfig.groups.map((group, index) => <div key={group.key}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{group.title}</span></div>)}
        </div>
        {saved && <div className="saved-callout"><strong><CheckCircleRounded /> Saved</strong><span>{saved.name} • {saved.rollNo}</span><button onClick={() => navigate('/students')}>View master data →</button></div>}
        <div className="showcase-footer"><span>GJIMT Placement Cell</span><span className="motto">Aspire · Achieve · Ascend</span></div>
      </aside>
      <section className="split-form">
        <div className="split-form-head"><div><span className="login-eyebrow">Profile details</span><h3>Student information</h3><p>Add the basics now; enrich the profile later.</p></div><span className="step-pill">Required fields marked *</span></div>
        <Link to="/students" state={{ openImport: true }} className="bulk-import-link"><FileUploadRounded /><span><strong>Adding a whole class?</strong> Import students from an Excel or CSV file instead</span><ArrowForwardRounded /></Link>
        <form onSubmit={submit}><RecordFields config={studentConfig} values={form} onChange={update} /><div className="modal-actions"><button type="button" className="soft-button" onClick={() => navigate('/students')}>Cancel</button><button className="primary-button" disabled={saving} type="submit"><SaveRounded /> {saving ? 'Saving…' : 'Save student'}</button></div></form>
      </section>
    </div>
  </div></AppShell>
}
