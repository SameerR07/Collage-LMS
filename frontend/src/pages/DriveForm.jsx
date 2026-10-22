import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AccessTimeRounded, AddRounded, BusinessRounded, CampaignRounded, CheckRounded, EventRounded, FactCheckRounded, LayersRounded,
  MailOutlineRounded, MarkEmailReadRounded, PlaceRounded, SaveRounded, SchoolRounded, VisibilityRounded, WorkOutlineRounded,
} from '@mui/icons-material'
import AppShell from '../components/AppShell'
import PageBanner from '../components/PageBanner'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { addRecord, listRecords, updateRecord } from '../lib/dataStore'
import {
  BACKLOG_OPTIONS, DEFAULT_LEAVE_OUT, DRIVE_COURSES, DRIVE_MODES, LEAVE_OUT_OPTIONS, MAX_ROUNDS, ORDINALS, PROCESS_STEPS, SPECIALIZATIONS,
  buildDriveEmail, driveProblems, isVirtual, joinList, normalizeUrl, parseCourses, selectRecipients, splitList, venueLabel,
} from '../lib/driveEmail'
import { DRIVES, emailSummaryText, getDrive, todayISO } from '../lib/drives'
import { getMailStatus } from '../lib/mailClient'

const ROUND_KEYS = Array.from({ length: MAX_ROUNDS }, (_, index) => `round${index + 1}`)
const SPECIALIZATION_LABELS = SPECIALIZATIONS.map((item) => item.label)

const EMPTY = {
  company: '', website: '', about: '', registrationLink: '', applyBy: '', jdLink: '',
  role: '', summary: '', specialization: [], specializationOther: '', vacancies: '', locations: '', ctc: '', bond: '',
  mode: 'On campus', driveDate: '', reportingTime: '', venue: '', status: 'Open',
  roundsCount: '3', ...Object.fromEntries(ROUND_KEYS.map((key) => [key, ''])),
  eligible: [], batches: [], minTenth: '', minTwelfth: '', minGraduation: '', minPG: '', graduationRequired: '', backlogs: '', requirements: '',
  applyMarks: true, matchSpecialization: false, leaveOut: DEFAULT_LEAVE_OUT,
  howToApply: '', documents: '', notes: '', contact: '',
}

/** Saved drive → form values (chips for known specializations, the rest in "Other"). */
const fromRecord = (drive) => {
  const specializations = splitList(drive.specialization)
  return {
    ...EMPTY,
    ...Object.fromEntries(Object.keys(EMPTY).map((key) => [key, drive[key] ?? EMPTY[key]])),
    roundsCount: String(Math.min(MAX_ROUNDS, Math.max(1, Number(drive.roundsCount) || 1))),
    eligible: parseCourses(drive.eligible),
    batches: splitList(drive.batches),
    specialization: specializations.filter((item) => SPECIALIZATION_LABELS.includes(item)),
    specializationOther: specializations.filter((item) => !SPECIALIZATION_LABELS.includes(item)).join(', '),
    applyMarks: drive.applyMarks !== 'No',
    matchSpecialization: drive.matchSpecialization === 'Yes',
    leaveOut: drive.leaveOut !== undefined ? splitList(drive.leaveOut) : DEFAULT_LEAVE_OUT,
    mode: drive.mode || '',
  }
}

function Field({ id, label, hint, error, wide, children }) {
  return (
    <div className={`drive-field ${wide ? 'wide' : ''} ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="field-hint error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export default function DriveForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { push } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [original, setOriginal] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailUpdate, setEmailUpdate] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mail, setMail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([listRecords('students'), editing ? getDrive(id) : Promise.resolve(null), getMailStatus()])
      .then(([studentRows, drive, mailStatus]) => {
        if (!alive) return
        setStudents(studentRows)
        setMail(mailStatus)
        if (editing) {
          if (!drive) { push('That drive no longer exists.', 'error'); navigate('/drives', { replace: true }); return }
          setOriginal(drive); setForm(fromRecord(drive))
        }
      })
      .catch(() => push('Could not load the student list.', 'error'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [editing, id, navigate, push])

  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event?.target ? (event.target.type === 'checkbox' ? event.target.checked : event.target.value) : event })); setError('') }
  const toggle = (key, value) => setForm((current) => {
    const list = current[key]
    return { ...current, [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] }
  })
  /** Quick pick: fill the first empty round, adding a round if all are filled. */
  const addStep = (step) => setForm((current) => {
    const count = Number(current.roundsCount)
    const empty = ROUND_KEYS.slice(0, count).find((key) => !String(current[key]).trim())
    if (empty) return { ...current, [empty]: step }
    if (count >= MAX_ROUNDS) return current
    return { ...current, roundsCount: String(count + 1), [ROUND_KEYS[count]]: step }
  })

  const specializationList = useMemo(() => [...form.specialization, ...splitList(form.specializationOther)], [form.specialization, form.specializationOther])
  const record = useMemo(() => ({
    ...form,
    eligible: form.eligible.join(', '),
    locations: joinList(form.locations),
    specialization: specializationList.join(', '),
  }), [form, specializationList])
  const problems = driveProblems(record)
  const show = (key) => (touched ? problems[key] : '')

  const courseCounts = useMemo(() => Object.fromEntries(DRIVE_COURSES.map((course) => [course, selectRecipients(students, { courses: [course], leaveOut: [] }).inCourses])), [students])
  const batchOptions = useMemo(() => {
    const wanted = new Set(form.eligible)
    return [...new Set(students.filter((student) => parseCourses(student.course).some((course) => wanted.has(course))).map((student) => String(student.batch || '').trim()).filter(Boolean))].sort()
  }, [students, form.eligible])
  const hasMarks = Boolean(form.minTenth || form.minTwelfth || form.minGraduation)
  const audience = useMemo(() => selectRecipients(students, {
    courses: form.eligible, leaveOut: form.leaveOut, batches: form.batches.filter((batch) => batchOptions.includes(batch)),
    minMarks: { minTenth: form.minTenth, minTwelfth: form.minTwelfth, minGraduation: form.minGraduation }, applyMarks: form.applyMarks,
    specializations: specializationList, matchSpecialization: form.matchSpecialization,
  }), [students, form.eligible, form.leaveOut, form.batches, batchOptions, form.minTenth, form.minTwelfth, form.minGraduation, form.applyMarks, specializationList, form.matchSpecialization])
  const recipientCount = audience.recipients.length
  const leftOut = Object.entries(audience.skipped.byStatus)

  const preview = useMemo(() => buildDriveEmail({ ...record, website: normalizeUrl(record.website), registrationLink: normalizeUrl(record.registrationLink), jdLink: normalizeUrl(record.jdLink) }, audience.recipients[0] || { name: 'Student', course: form.eligible[0] }, { update: editing }), [record, audience.recipients, form.eligible, editing])

  const save = async (sendEmail) => {
    setTouched(true)
    setError('')
    if (Object.keys(problems).length) {
      setError('Please fill in the highlighted details.')
      requestAnimationFrame(() => document.querySelector('.drive-field.has-error input, .drive-field.has-error textarea, .drive-field.has-error select, .drive-field.has-error .course-picks button')?.focus())
      return
    }
    if (sendEmail && !recipientCount) { setError('No students match these choices, so there is nobody to email. Check the programmes, marks and “Don’t email” choices.'); return }
    if (sendEmail && !window.confirm(`Email the ${record.company} drive details to ${recipientCount} student${recipientCount === 1 ? '' : 's'} now?`)) return
    setSaving(true)
    const count = Number(form.roundsCount)
    const now = new Date().toISOString()
    const clean = (value) => String(value ?? '').trim()
    const payload = {
      company: clean(record.company), website: normalizeUrl(record.website), about: clean(record.about),
      registrationLink: normalizeUrl(record.registrationLink), applyBy: record.applyBy, jdLink: normalizeUrl(record.jdLink),
      role: clean(record.role), summary: clean(record.summary), specialization: record.specialization, vacancies: clean(record.vacancies),
      locations: record.locations, ctc: clean(record.ctc), bond: clean(record.bond),
      mode: record.mode, driveDate: record.driveDate, reportingTime: record.reportingTime, venue: clean(record.venue), status: record.status || 'Open',
      roundsCount: String(count), ...Object.fromEntries(ROUND_KEYS.map((key, index) => [key, index < count ? clean(record[key]) : ''])),
      eligible: record.eligible, batches: form.batches.filter((batch) => batchOptions.includes(batch)).join(', '),
      minTenth: clean(record.minTenth), minTwelfth: clean(record.minTwelfth), minGraduation: clean(record.minGraduation), minPG: clean(record.minPG),
      graduationRequired: clean(record.graduationRequired), backlogs: clean(record.backlogs), requirements: clean(record.requirements),
      applyMarks: form.applyMarks ? 'Yes' : 'No', matchSpecialization: form.matchSpecialization ? 'Yes' : 'No', leaveOut: form.leaveOut.join(', '),
      howToApply: clean(record.howToApply), documents: clean(record.documents), notes: clean(record.notes), contact: clean(record.contact),
      updatedBy: user?.email || '', updatedAt: now,
      ...(editing ? {} : { createdBy: user?.email || '', postedBy: user?.displayName || '' }),
    }
    if (sendEmail) {
      const log = audience.recipients.map(({ name, email, course }) => ({ name, email, course, status: 'queued' }))
      Object.assign(payload, {
        emailLog: log, emailKind: editing ? 'update' : 'new', emailRequestedAt: now, emailSummary: emailSummaryText(log),
        ...(original?.emailLog?.length ? { emailHistory: [...(original.emailHistory || []), { kind: original.emailKind || 'new', at: original.emailUpdatedAt || original.emailRequestedAt || '', summary: original.emailSummary || '' }] } : {}),
      })
    }
    try {
      const saved = editing ? (await updateRecord(DRIVES, id, payload), { id }) : await addRecord(DRIVES, payload)
      push(sendEmail ? `Drive saved — emailing ${recipientCount} student${recipientCount === 1 ? '' : 's'}…` : 'Drive saved.')
      navigate(`/drives/${saved.id}`, { state: { send: sendEmail } })
    } catch (err) {
      setError(err?.message || 'The drive could not be saved.')
    } finally { setSaving(false) }
  }

  const title = editing ? `Edit ${original?.company || 'drive'}` : 'New placement drive'
  const virtual = isVirtual(form.mode)

  return <AppShell title={editing ? 'Edit drive' : 'New drive'} subtitle="Placement Drives"><div className="page-stack drive-form-page">
    <PageBanner
      icon={CampaignRounded}
      eyebrow="Placement Drive desk"
      title={title}
      description={editing ? 'Change any detail. You can email the updated details to the students again.' : 'Fill in the details from the company’s placement notice, tick the eligible programmes, and every matching student gets the full details by email.'}
      back={{ to: editing ? `/drives/${id}` : '/drives', label: editing ? 'Back to drive' : 'All drives' }}
    />

    {/* Enter in a field never sends emails — only the buttons do */}
    <form className="drive-layout" onSubmit={(event) => event.preventDefault()} noValidate aria-busy={loading}>
      <div className="drive-sections">
        <section className="surface-card drive-card">
          <div className="surface-head"><div><span>Step 1</span><h3>Company &amp; registration</h3></div><BusinessRounded /></div>
          <div className="drive-grid">
            <Field id="d-company" label="Company name *" error={show('company')}><input id="d-company" value={form.company} onChange={set('company')} placeholder="e.g. ICICI Bank" autoComplete="organization" /></Field>
            <Field id="d-website" label="Website" error={show('website')}><input id="d-website" type="url" inputMode="url" value={form.website} onChange={set('website')} placeholder="e.g. www.icici.bank.in" /></Field>
            <Field id="d-about" label="About the company" hint="One line students see under the company name" wide><input id="d-about" value={form.about} onChange={set('about')} placeholder="e.g. India’s second largest private sector bank" /></Field>
            <Field id="d-reglink" label="Registration link" error={show('registrationLink')} hint="Where students apply — shown as a “Register” button in the email"><input id="d-reglink" type="url" inputMode="url" value={form.registrationLink} onChange={set('registrationLink')} placeholder="https://careers.company.com/…" /></Field>
            <Field id="d-applyby" label="Last date to register" error={show('applyBy')}><input id="d-applyby" type="date" value={form.applyBy} onChange={set('applyBy')} /></Field>
            <Field id="d-jdlink" label="JD document link" error={show('jdLink')} hint="Optional — e.g. the company’s PDF on Google Drive" wide><input id="d-jdlink" type="url" inputMode="url" value={form.jdLink} onChange={set('jdLink')} placeholder="https://drive.google.com/…" /></Field>
          </div>
        </section>

        <section className="surface-card drive-card">
          <div className="surface-head"><div><span>Step 2</span><h3>Job</h3></div><WorkOutlineRounded /></div>
          <div className="drive-grid">
            <Field id="d-role" label="Job role / profile *" error={show('role')}><input id="d-role" value={form.role} onChange={set('role')} placeholder="e.g. Relationship Manager" /></Field>
            <Field id="d-ctc" label="Package / CTC / stipend *" error={show('ctc')} hint="As students should see it, e.g. ₹4.08–4.44 LPA (varies by location)"><input id="d-ctc" value={form.ctc} onChange={set('ctc')} placeholder="e.g. ₹4.08–4.44 LPA" /></Field>
            <Field id="d-vacancies" label="Number of vacancies"><input id="d-vacancies" value={form.vacancies} onChange={set('vacancies')} placeholder="e.g. 20, or Not disclosed" /></Field>
            <Field id="d-locations" label="Job location(s) *" error={show('locations')} hint="Separate places with commas"><input id="d-locations" value={form.locations} onChange={set('locations')} placeholder="e.g. Mohali, Chandigarh, Pan India" /></Field>
            <Field id="d-bond" label="Bond / service agreement"><input id="d-bond" value={form.bond} onChange={set('bond')} placeholder="e.g. None, or 1 year" /></Field>
            <div className="drive-field wide">
              <span className="drive-label" id="spec-label">Specialization</span>
              <div className="chip-picks" role="group" aria-labelledby="spec-label">
                {SPECIALIZATION_LABELS.map((label) => <button key={label} type="button" role="checkbox" aria-checked={form.specialization.includes(label)} className={`chip-pick ${form.specialization.includes(label) ? 'on' : ''}`} onClick={() => toggle('specialization', label)}>{label}</button>)}
              </div>
              <input id="d-spec-other" aria-label="Other specialization" className="spaced-input" value={form.specializationOther} onChange={set('specializationOther')} placeholder="Other specialization(s), separated by commas" />
            </div>
            <Field id="d-summary" label="Job description (JD) *" error={show('summary')} hint="Roles & responsibilities, key aspects, shifts — paste from the company’s notice" wide><textarea id="d-summary" rows={6} value={form.summary} onChange={set('summary')} placeholder={'e.g.\nAs Relationship Manager you will engage with the Bank’s customers…\n• Offer suitable solutions to customers\n• Work in rotational shifts as per business needs'} /></Field>
          </div>
        </section>

        <section className="surface-card drive-card">
          <div className="surface-head"><div><span>Step 3</span><h3>Drive</h3></div><EventRounded /></div>
          <div className="drive-grid four drive-when">
            <Field id="d-mode" label="Mode of drive *" error={show('mode')}><select id="d-mode" value={form.mode} onChange={set('mode')}><option value="">Choose…</option>{DRIVE_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select></Field>
            <Field id="d-date" label="Date of drive *" error={show('driveDate')}><input id="d-date" type="date" value={form.driveDate} min={editing ? undefined : todayISO()} onChange={set('driveDate')} /></Field>
            <Field id="d-time" label="Reporting time *" error={show('reportingTime')}><input id="d-time" type="time" value={form.reportingTime} onChange={set('reportingTime')} /></Field>
            <Field id="d-status" label="Status"><select id="d-status" value={form.status} onChange={set('status')}><option>Open</option><option>Scheduled</option><option>Closed</option></select></Field>
            <Field id="d-venue" label={`${venueLabel(form.mode)}${virtual ? '' : ' *'}`} error={show('venue')} hint={virtual ? 'Optional — e.g. Microsoft Teams, link shared later' : 'Hall, building and campus or the company’s office address'} wide><input id="d-venue" value={form.venue} onChange={set('venue')} placeholder={virtual ? 'e.g. https://teams.microsoft.com/…' : 'e.g. Seminar Hall, Block B, GJIMT Mohali'} /></Field>
          </div>
        </section>

        <section className="surface-card drive-card">
          <div className="surface-head"><div><span>Step 4</span><h3>Selection process</h3></div><LayersRounded /></div>
          <div className="rounds-picker" role="radiogroup" aria-label="Number of rounds">
            <span>Number of rounds</span>
            {ROUND_KEYS.map((_, index) => String(index + 1)).map((count) => <button key={count} type="button" role="radio" aria-checked={form.roundsCount === count} className={form.roundsCount === count ? 'active' : ''} onClick={() => set('roundsCount')(count)}>{count}</button>)}
          </div>
          <div className="step-picks">
            <span>Quick add</span>
            {PROCESS_STEPS.map((step) => <button key={step} type="button" className="chip-pick small" onClick={() => addStep(step)}><AddRounded /> {step}</button>)}
          </div>
          <datalist id="process-steps">{PROCESS_STEPS.map((step) => <option key={step} value={step} />)}</datalist>
          <div className="drive-grid three">
            {ROUND_KEYS.slice(0, Number(form.roundsCount)).map((key, index) => (
              <Field key={key} id={`d-${key}`} label={`${ORDINALS[index]} round *`} error={show(key)}><input id={`d-${key}`} list="process-steps" value={form[key]} onChange={set(key)} placeholder={PROCESS_STEPS[[3, 6, 7, 8, 9][index]]} /></Field>
            ))}
          </div>
        </section>

        <section className="surface-card drive-card">
          <div className="surface-head"><div><span>Step 5</span><h3>Eligibility</h3></div><SchoolRounded /></div>
          <div className={`drive-field wide ${show('eligible') ? 'has-error' : ''}`}>
            <span className="drive-label" id="courses-label">Programme(s) eligible *</span>
            <div className="course-picks" role="group" aria-labelledby="courses-label">
              {DRIVE_COURSES.map((course) => {
                const on = form.eligible.includes(course)
                return <button key={course} type="button" role="checkbox" aria-checked={on} className={`course-pick ${on ? 'on' : ''}`} onClick={() => toggle('eligible', course)}>
                  <i aria-hidden="true">{on && <CheckRounded />}</i><strong>{course}</strong><small>{loading ? '…' : `${courseCounts[course]} student${courseCounts[course] === 1 ? '' : 's'}`}</small>
                </button>
              })}
            </div>
            {show('eligible') && <span className="field-hint error" role="alert">{problems.eligible}</span>}
          </div>
          {batchOptions.length > 1 && <div className="drive-field wide">
            <span className="drive-label" id="batch-label">Batch <em>(optional — leave all unticked for every batch)</em></span>
            <div className="chip-picks" role="group" aria-labelledby="batch-label">
              {batchOptions.map((batch) => <button key={batch} type="button" role="checkbox" aria-checked={form.batches.includes(batch)} className={`chip-pick ${form.batches.includes(batch) ? 'on' : ''}`} onClick={() => toggle('batches', batch)}>{batch}</button>)}
            </div>
          </div>}
          <div className="drive-field wide">
            <span className="drive-label">Minimum marks <em>(leave blank if not required)</em></span>
            <div className="drive-grid four marks-grid">
              <Field id="d-x" label="Class X %" error={show('minTenth')}><span className="input-suffix"><input id="d-x" type="number" min="0" max="100" step="0.1" value={form.minTenth} onChange={set('minTenth')} placeholder="e.g. 60" /><em aria-hidden="true">%</em></span></Field>
              <Field id="d-xii" label="Class XII %" error={show('minTwelfth')}><span className="input-suffix"><input id="d-xii" type="number" min="0" max="100" step="0.1" value={form.minTwelfth} onChange={set('minTwelfth')} placeholder="e.g. 60" /><em aria-hidden="true">%</em></span></Field>
              <Field id="d-grad" label="Graduation %" error={show('minGraduation')}><span className="input-suffix"><input id="d-grad" type="number" min="0" max="100" step="0.1" value={form.minGraduation} onChange={set('minGraduation')} placeholder="e.g. 55" /><em aria-hidden="true">%</em></span></Field>
              <Field id="d-pg" label="MBA / MCA"><input id="d-pg" value={form.minPG} onChange={set('minPG')} placeholder="e.g. 60% or 6.0 CGPA" /></Field>
            </div>
            {hasMarks && <label className="check-row"><input type="checkbox" checked={form.applyMarks} onChange={set('applyMarks')} /><span>Don’t email students whose recorded marks are below these (students with no marks on record still get the email)</span></label>}
          </div>
          <div className="drive-grid">
            <Field id="d-gradreq" label="Graduation required"><input id="d-gradreq" value={form.graduationRequired} onChange={set('graduationRequired')} placeholder="e.g. Any graduation, regular mode" /></Field>
            <Field id="d-backlogs" label="Active backlogs"><input id="d-backlogs" list="backlog-options" value={form.backlogs} onChange={set('backlogs')} placeholder="e.g. No active backlogs allowed" /><datalist id="backlog-options">{BACKLOG_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist></Field>
            <Field id="d-req" label="Skills & other requirements *" error={show('requirements')} hint="Write “None” if there is nothing else" wide><textarea id="d-req" rows={4} value={form.requirements} onChange={set('requirements')} placeholder={'e.g.\nGood communication skills\nWilling to relocate'} /></Field>
          </div>
          {specializationList.length > 0 && !specializationList.includes('Any specialization') && <label className="check-row"><input type="checkbox" checked={form.matchSpecialization} onChange={set('matchSpecialization')} /><span>Email only students whose specialization matches ({specializationList.join(', ')})</span></label>}
          <div className="drive-field wide spaced-top">
            <span className="drive-label" id="leave-label">Don’t email students who are</span>
            <div className="chip-picks" role="group" aria-labelledby="leave-label">
              {LEAVE_OUT_OPTIONS.map((option) => <button key={option.status} type="button" role="checkbox" aria-checked={form.leaveOut.includes(option.status)} className={`chip-pick ${form.leaveOut.includes(option.status) ? 'on' : ''}`} onClick={() => toggle('leaveOut', option.status)}>{option.label}</button>)}
            </div>
          </div>
        </section>

        <section className="surface-card drive-card">
          <div className="surface-head"><div><span>Step 6</span><h3>Instructions &amp; contact</h3></div><FactCheckRounded /></div>
          <div className="drive-grid">
            <Field id="d-howto" label="How to apply" hint="Steps students must follow, e.g. which college to choose in the company’s form" wide><textarea id="d-howto" rows={4} value={form.howToApply} onChange={set('howToApply')} placeholder={'e.g.\n1. Open the registration link and click Apply\n2. Use your personal email ID\n3. Choose “Gian Jyoti Institute of Management and Technology, S.A.S Nagar” as the college'} /></Field>
            <Field id="d-docs" label="Documents to bring"><input id="d-docs" value={form.documents} onChange={set('documents')} placeholder="e.g. 2 copies of resume, ID proof, mark sheets" /></Field>
            <Field id="d-contact" label="Contact"><input id="d-contact" value={form.contact} onChange={set('contact')} placeholder="e.g. Placement Cell, 98xxxxxx10" /></Field>
            <Field id="d-notes" label="Important notes" hint="Compliance notes, dress code, anything students must not miss" wide><textarea id="d-notes" rows={4} value={form.notes} onChange={set('notes')} placeholder="e.g. Students with pending academic backlogs should not apply." /></Field>
          </div>
        </section>
      </div>

      <aside className="drive-aside">
        <section className="surface-card audience-card" aria-live="polite">
          <div className="surface-head"><div><span>Email goes to</span><h3><strong className="audience-total" data-testid="recipient-count">{loading ? '…' : recipientCount}</strong> student{recipientCount === 1 ? '' : 's'}</h3></div><MailOutlineRounded /></div>
          {!form.eligible.length && <p className="audience-note">Tick the programmes this job is open to.</p>}
          {form.eligible.length > 0 && <ul className="audience-list">
            {form.eligible.map((course) => <li key={course}><span>{course}</span><strong>{audience.byCourse[course] || 0}</strong></li>)}
          </ul>}
          {(leftOut.length > 0 || Object.entries(audience.skipped).some(([key, value]) => key !== 'byStatus' && value > 0)) && <div className="audience-skipped">
            <span>Not emailed</span>
            <ul>
              {leftOut.map(([status, count]) => <li key={status}>{count} {status.toLowerCase()}</li>)}
              {audience.skipped.belowMarks > 0 && <li>{audience.skipped.belowMarks} below the minimum marks</li>}
              {audience.skipped.specialization > 0 && <li>{audience.skipped.specialization} with another specialization</li>}
              {audience.skipped.otherBatch > 0 && <li>{audience.skipped.otherBatch} in other batches</li>}
              {audience.skipped.noEmail > 0 && <li>{audience.skipped.noEmail} with no valid email ID</li>}
              {audience.skipped.duplicate > 0 && <li>{audience.skipped.duplicate} repeated email</li>}
            </ul>
          </div>}
          {hasMarks && form.applyMarks && audience.marksUnknown > 0 && <p className="audience-note">{audience.marksUnknown} student{audience.marksUnknown === 1 ? ' has' : 's have'} no marks on record — still emailed.</p>}
          <button type="button" className="soft-button full" onClick={() => setPreviewOpen(true)} disabled={!form.company && !form.role}><VisibilityRounded /> Preview the email</button>
          <p className={`mail-state ${mail?.configured ? 'ready' : 'waiting'}`}><i aria-hidden="true" />{mail === null ? 'Checking the email service…' : mail.configured ? `Email ready — sends as ${mail.from}` : mail.reachable ? 'Email not set up yet — emails will wait in the queue' : 'Email service not running here — emails will wait in the queue'}</p>
        </section>

        <section className="surface-card save-card">
          {error && <div className="form-error" role="alert">{error}</div>}
          {editing && <label className="check-row"><input type="checkbox" checked={emailUpdate} onChange={(event) => setEmailUpdate(event.target.checked)} /><span>Email the updated details to {recipientCount} student{recipientCount === 1 ? '' : 's'}</span></label>}
          {editing
            ? <button type="button" className="primary-button full" disabled={saving || loading} onClick={() => save(emailUpdate)}>{emailUpdate ? <MarkEmailReadRounded /> : <SaveRounded />} {saving ? 'Saving…' : emailUpdate ? 'Save & email update' : 'Save changes'}</button>
            : <>
              <button type="button" className="primary-button full" disabled={saving || loading} onClick={() => save(true)}><MarkEmailReadRounded /> {saving ? 'Saving…' : `Save & email ${recipientCount} student${recipientCount === 1 ? '' : 's'}`}</button>
              <button type="button" className="soft-button full" disabled={saving || loading} onClick={() => save(false)}><SaveRounded /> Save without emailing</button>
            </>}
          <p className="save-note"><AccessTimeRounded /> <span>Saved drives appear in the Placement Drives list{editing ? '' : ', where you can email students later'}.</span></p>
          <p className="save-note"><PlaceRounded /> <span>Students get one personal email each, with all the details above.</span></p>
        </section>
      </aside>
    </form>

    <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} eyebrow="Email preview" title="What students receive" description={`Subject: ${preview.subject}`} width="780px">
      <iframe className="email-preview" title="Email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={preview.html} />
    </Modal>
  </div></AppShell>
}
