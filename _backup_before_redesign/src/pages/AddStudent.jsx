import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowBackRounded, CheckCircleRounded, PersonAddAlt1Rounded, SaveRounded } from '@mui/icons-material'
import AppShell from '../components/AppShell'
import { addRecord } from '../lib/dataStore'
import { useToast } from '../context/ToastContext'

const defaults = { name: '', rollNo: '', course: 'BCA', batch: '2023-26', email: '', phone: '', cgpa: '', placementStatus: 'Eligible', company: '' }

export default function AddStudent() {
  const navigate = useNavigate(); const { push } = useToast(); const [form, setForm] = useState(defaults); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(null)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => { event.preventDefault(); setSaving(true); try { const student = await addRecord('students', form); setSaved(student); push('Student record added successfully.') } catch (error) { push(error?.message || 'Could not add the student.', 'error') } finally { setSaving(false) } }
  return <AppShell title="Add Student Data" subtitle="Master Data"><div className="page-stack">
    <div className="page-heading-row"><div className="page-heading-left"><Link to="/students" className="back-link"><ArrowBackRounded /> Master Data</Link><div className="page-title-icon teal"><PersonAddAlt1Rounded /></div><div><span className="page-eyebrow">Student database</span><h2>Add Student Data</h2><p>Create a complete placement-ready profile in one step.</p></div></div></div>
    <div className="form-page-grid"><section className="surface-card large-form-card"><div className="surface-head"><div><span>Profile details</span><h3>Student information</h3></div><span className="step-pill">Required fields marked *</span></div><form onSubmit={submit}><div className="form-grid">
      <label className="form-control"><span>Full name *</span><input value={form.name} onChange={(e) => update('name', e.target.value)} required placeholder="e.g. Simran Kaur" /></label>
      <label className="form-control"><span>Roll number *</span><input value={form.rollNo} onChange={(e) => update('rollNo', e.target.value)} required placeholder="e.g. BCA23026" /></label>
      <label className="form-control"><span>Course *</span><select value={form.course} onChange={(e) => update('course', e.target.value)} required>{['BCA','BBA','MBA','MCA'].map((option)=><option key={option}>{option}</option>)}</select></label>
      <label className="form-control"><span>Batch *</span><input value={form.batch} onChange={(e) => update('batch', e.target.value)} required placeholder="e.g. 2023-26" /></label>
      <label className="form-control"><span>Email *</span><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required placeholder="student@example.com" /></label>
      <label className="form-control"><span>Phone *</span><input value={form.phone} onChange={(e) => update('phone', e.target.value)} required minLength={10} maxLength={15} placeholder="10-digit mobile" /></label>
      <label className="form-control"><span>CGPA</span><input type="number" step="0.1" min="0" max="10" value={form.cgpa} onChange={(e) => update('cgpa', e.target.value)} placeholder="8.2" /></label>
      <label className="form-control"><span>Placement status *</span><select value={form.placementStatus} onChange={(e) => update('placementStatus', e.target.value)} required>{['Eligible','In Process','Placed','Not Eligible'].map((option)=><option key={option}>{option}</option>)}</select></label>
      <label className="form-control full"><span>Placed company (optional)</span><input value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Add company after selection" /></label>
    </div><div className="modal-actions"><button type="button" className="soft-button" onClick={() => navigate('/students')}>Cancel</button><button className="primary-button" disabled={saving} type="submit"><SaveRounded /> {saving ? 'Saving…' : 'Save student'}</button></div></form></section>
    <aside className="surface-card tip-card"><span className="tip-icon"><CheckCircleRounded /></span><h3>Why this matters</h3><p>Good master data keeps eligibility checks, placement lists and reports accurate. Add the basics now; enrich the profile later.</p><div className="tip-list"><span>✓ Contact details</span><span>✓ Academic snapshot</span><span>✓ Placement status</span><span>✓ Company outcome</span></div>{saved && <div className="saved-callout"><strong>Saved</strong><span>{saved.name} • {saved.rollNo}</span><button onClick={() => navigate('/students')}>View master data →</button></div>}</aside>
    </div>
  </div></AppShell>
}
