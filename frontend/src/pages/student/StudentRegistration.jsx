import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppRegistrationRounded, CheckCircleRounded, InfoOutlined, SaveRounded } from '@mui/icons-material'
import AppShell from '../../components/AppShell'
import PageBanner from '../../components/PageBanner'
import RecordFields from '../../components/RecordFields'
import StudentGate from '../../components/StudentGate'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { saveRegistration, studentsForChecks } from '../../lib/studentPortal'
import { IDENTITY_FIELDS, registrationConfig, registrationFields, registrationProblems, registrationProgress } from '../../lib/studentRules'
import { statusClass } from '../../lib/utils'

const startValues = (record, user) => {
  const values = Object.fromEntries(registrationFields(record || {}).map((field) => [field.key, record?.[field.key] ?? '']))
  values.email = record?.email || user?.email || ''
  if (!record) values.name = user?.displayName || ''
  return values
}

function RegistrationForm({ record, setRecord }) {
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const isNew = !record
  const [values, setValues] = useState(() => startValues(record, user))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const config = registrationConfig(values)
  // Email always belongs to the account; once in Master Data, identity fields are fixed
  const locked = isNew ? ['email'] : IDENTITY_FIELDS

  const change = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => { const next = { ...current }; delete next[key]; return next })
  }

  const submit = async (event) => {
    event.preventDefault()
    const problems = registrationProblems({ ...values, email: user.email }, { students: await studentsForChecks(), selfId: record?.id || null })
    setErrors(problems)
    if (Object.keys(problems).length) {
      push(`Please check ${Object.keys(problems).length} field${Object.keys(problems).length === 1 ? '' : 's'} marked in red.`, 'error')
      requestAnimationFrame(() => document.querySelector('.form-control.has-error input, .form-control.has-error select')?.focus())
      return
    }
    setSaving(true)
    try {
      const { record: saved, created } = await saveRegistration(user, values, record)
      setRecord(saved)
      if (created) { push('Registration complete — you are now in the college Master Data.'); navigate('/student', { replace: true }) }
      else push('Your registration is updated.')
    } catch (error) {
      push(error?.message || 'Your registration could not be saved.', 'error')
    } finally { setSaving(false) }
  }

  return <div className="registration-layout">
    <form className="surface-card registration-form" onSubmit={submit} noValidate>
      <div className="surface-head"><div><span>{isNew ? 'Step 1 of 1' : 'Your details'}</span><h3>{isNew ? 'Complete your registration' : 'Placement registration'}</h3></div><span className="step-pill">Required fields marked *</span></div>
      {isNew && <div className="setup-callout info" role="note"><InfoOutlined /><div><strong>Your email isn’t in the Master Data yet</strong><p>Fill in your full details below. When you save, you are added to the college Master Data with this email ({user.email}).</p></div></div>}
      <RecordFields config={config} values={values} onChange={change} errors={errors} locked={locked} />
      <div className="modal-actions">
        <button className="primary-button" disabled={saving} type="submit"><SaveRounded /> {saving ? 'Saving…' : isNew ? 'Submit registration' : 'Save changes'}</button>
      </div>
    </form>
    <aside className="registration-side">
      <section className="surface-card">
        <div className="surface-head"><div><span>Record</span><h3>{isNew ? 'New student' : record.name}</h3></div></div>
        {isNew
          ? <p className="muted-copy">Your record is created when you submit this form.</p>
          : <dl className="fact-list compact-facts">
            <div><dt>Uni. Roll No.</dt><dd>{record.rollNo || '—'}</dd></div>
            <div><dt>Course</dt><dd>{record.course || '—'}{record.batch ? ` · ${record.batch}` : ''}</dd></div>
            <div><dt>Placement status</dt><dd><span className={`status-badge ${statusClass(record.placementStatus)}`}><i />{record.placementStatus || '—'}</span></dd></div>
            {record.company && <div><dt>Company</dt><dd>{record.company}</dd></div>}
            <div><dt>Form filled</dt><dd>{registrationProgress(record)}%</dd></div>
          </dl>}
      </section>
      <section className="surface-card side-notes">
        <p><CheckCircleRounded /><span>Name, roll number, course, batch and email are fixed once you are in the Master Data — the Placement Cell can correct them.</span></p>
        <p><CheckCircleRounded /><span>Answering “No” to <em>Interested</em> marks you as Opted Out: you won’t get drive emails or be able to apply.</span></p>
        <p><CheckCircleRounded /><span>Placement status and company are updated by the Placement Cell.</span></p>
      </section>
    </aside>
  </div>
}

export default function StudentRegistration() {
  return <AppShell title="Registration" subtitle="Student portal"><div className="page-stack">
    <StudentGate allowWithoutRecord>{({ record, setRecord }) => <>
      <PageBanner
        icon={AppRegistrationRounded}
        eyebrow="Student portal"
        title={record ? 'Placement registration' : 'Complete your registration'}
        description={record ? 'Keep your contact details, marks and placement preferences up to date — the Placement Cell uses them to check who can apply for each drive.' : 'Your email was not found in the college Master Data, so we need your full details once.'}
      />
      <RegistrationForm key={record?.id || 'new'} record={record} setRecord={setRecord} />
    </>}</StudentGate>
  </div></AppShell>
}
