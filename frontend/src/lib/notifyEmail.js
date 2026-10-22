/* =========================================================
   Every email other than the drive announcement: one template per
   kind. Shared by the app (queue + preview) and the mail server
   (sending), so both always agree. The server only accepts these
   kinds and only the fields listed for each — the mail API can't be
   used to send free text to anyone.
========================================================= */
import { formatDriveDate, formatTime, safeUrl } from './driveEmail.js'

export const NOTIFY_TEXT_LIMIT = 1500
export const COLLEGE_NAME = 'Gian Jyoti Institute of Management & Technology'

/** kind → { label, fields, toStaff?, serverOnly? } */
export const NOTIFY_KINDS = {
  welcome: { label: 'Student account created', fields: ['linked', 'rollNo', 'course', 'batch'] },
  registrationSaved: { label: 'Registration received', fields: ['rollNo', 'course', 'batch', 'phone', 'placementInterest'] },
  newStudentAlert: { label: 'New student registered', fields: ['studentName', 'studentEmail', 'rollNo', 'course', 'batch', 'phone'], toStaff: true },
  applicationReceived: { label: 'Application received', fields: ['company', 'role', 'driveDate', 'reportingTime', 'venue', 'mode', 'registrationLink', 'applyBy'] },
  applicationStatus: { label: 'Application update', fields: ['company', 'role', 'status', 'roundsCleared', 'roundsTotal', 'note', 'driveDate'] },
  attendanceSession: { label: 'Attendance session', fields: ['title', 'kind', 'date', 'time', 'venue', 'company'] },
  code: { label: 'Verification code', fields: ['code', 'purpose', 'minutes'], serverOnly: true },
}

export const isNotifyKind = (kind) => Object.prototype.hasOwnProperty.call(NOTIFY_KINDS, kind)

/** Only the fields this kind uses, as short strings. */
export function cleanNotifyData(kind, data = {}) {
  const spec = NOTIFY_KINDS[kind]
  if (!spec) return {}
  return Object.fromEntries(spec.fields.map((key) => [key, String(data?.[key] ?? '').trim().slice(0, NOTIFY_TEXT_LIMIT)]))
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const htmlLines = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>')
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'Student'

/** Same look as the drive email: navy header, ember accent, detail table, optional button. */
function layout({ subject, eyebrow, title, subtitle = '', greeting, paragraphs = [], rows = [], button = null, highlight = '', note = '', senderName, footer }) {
  const visibleRows = rows.filter(([, value]) => String(value ?? '').trim())
  const text = [
    greeting, '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(highlight ? [highlight, ''] : []),
    ...(visibleRows.length ? [...visibleRows.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...(note ? [note, ''] : []),
    'Regards,', senderName, COLLEGE_NAME,
  ].join('\n')

  const rowsHtml = visibleRows.length ? `
        <tr><td style="padding:20px 26px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EDE7DD;border-radius:10px;border-collapse:separate;">${visibleRows.map(([label, value, kind]) => `
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #EDE7DD;color:#646E7E;font-size:13px;font-weight:600;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #EDE7DD;color:#0F1B2D;font-size:14px;vertical-align:top;">${kind === 'link' ? `<a href="${escapeHtml(value)}" style="color:#C2410C;font-weight:600;word-break:break-all;" target="_blank" rel="noopener">${escapeHtml(value)}</a>` : htmlLines(value)}</td>
            </tr>`).join('')}
          </table>
        </td></tr>` : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F2EC;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E6E0D6;">
        <tr><td style="background:#0F1B2D;padding:22px 26px;border-bottom:4px solid #C2410C;">
          <div style="color:#E3C27A;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
          <div style="color:#FFFFFF;font-size:21px;font-weight:700;margin-top:6px;">${escapeHtml(title)}</div>
          ${subtitle ? `<div style="color:#C9D1DD;font-size:14px;margin-top:5px;">${escapeHtml(subtitle)}</div>` : ''}
        </td></tr>
        <tr><td style="padding:24px 26px 0;color:#0F1B2D;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
          ${paragraphs.map((paragraph) => `<p style="margin:0 0 12px;">${htmlLines(paragraph)}</p>`).join('')}
        </td></tr>
        ${highlight ? `<tr><td style="padding:4px 26px 0;"><div style="display:inline-block;background:#FFF4EC;border:1px dashed #C2410C;border-radius:10px;padding:12px 22px;color:#0F1B2D;font-size:28px;font-weight:800;letter-spacing:6px;">${escapeHtml(highlight)}</div></td></tr>` : ''}
        ${rowsHtml}
        ${button ? `<tr><td style="padding:20px 26px 0;"><a href="${escapeHtml(button.url)}" target="_blank" rel="noopener" style="display:inline-block;background:#C2410C;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:9px;">${escapeHtml(button.label)}</a></td></tr>` : ''}
        <tr><td style="padding:22px 26px 26px;color:#2B3445;font-size:14px;line-height:1.6;">
          ${note ? `<p style="margin:0 0 16px;color:#646E7E;">${htmlLines(note)}</p>` : ''}
          <p style="margin:0;">Regards,<br><strong>${escapeHtml(senderName)}</strong><br><span style="color:#646E7E;">${escapeHtml(COLLEGE_NAME)}</span></p>
        </td></tr>
      </table>
      <div style="color:#8A93A3;font-size:12px;margin-top:14px;">${escapeHtml(footer)}</div>
    </td></tr>
  </table>
</body></html>`
  return { subject, text, html }
}

const STATUS_LINES = {
  Applied: (d) => `Your application for ${d.company} (${d.role}) is marked as Applied.`,
  Shortlisted: (d) => `Good news — you have been shortlisted in the ${d.company} drive for ${d.role}. Watch your email and the student portal for the next round.`,
  Selected: (d) => `Congratulations! You have been selected by ${d.company} for the role of ${d.role}. The Placement Cell will share the next steps (offer letter, joining details) with you.`,
  'Not selected': (d) => `Thank you for taking part in the ${d.company} drive. You were not selected this time — keep preparing, more drives are on the way.`,
  Withdrawn: (d) => `Your application for ${d.company} (${d.role}) has been withdrawn.`,
}

/**
 * Builds one email: { subject, text, html }.
 * recipient: { name, email }; options: { senderName, portalUrl } — portalUrl comes from the server's APP_URL only.
 */
export function buildNotifyEmail(kind, rawData = {}, recipient = {}, { senderName = 'GJIMT Placement Cell', portalUrl = '' } = {}) {
  if (!isNotifyKind(kind)) throw new Error(`Unknown email kind "${kind}"`)
  const d = cleanNotifyData(kind, rawData)
  const greeting = `Dear ${firstName(recipient.name)},`
  const portal = safeUrl(portalUrl)
  const portalButton = portal ? { label: 'Open the student portal', url: portal } : null
  const base = { senderName, greeting, footer: 'Sent by the GJIMT Placement LMS.' }

  switch (kind) {
    case 'welcome': {
      const linked = d.linked === 'Yes'
      return layout({
        ...base,
        subject: 'Your GJIMT student placement account is ready',
        eyebrow: 'Student portal', title: 'Welcome to the Placement LMS', subtitle: recipient.email || '',
        paragraphs: linked
          ? ['Your student account has been created and linked to your record in the college Master Data.', 'You can now update your registration, apply for placement drives open to your course and mark your attendance at placement sessions.']
          : ['Your student account has been created.', 'We could not find your email in the college Master Data, so please complete your registration in the student portal. The Placement Cell uses these details to check eligibility for drives.'],
        rows: linked ? [['Uni. Roll No.', d.rollNo], ['Course', d.course], ['Batch', d.batch]] : [],
        button: portalButton,
        note: 'If you did not create this account, reply to this email and let the Placement Cell know.',
      })
    }
    case 'registrationSaved':
      return layout({
        ...base,
        subject: 'Registration received — GJIMT Placement Cell',
        eyebrow: 'Registration', title: 'Your registration is saved', subtitle: [d.course, d.batch].filter(Boolean).join(' · '),
        paragraphs: ['Thank you for registering with the Placement Cell. Your details are now in the college Master Data.', 'You will receive placement drive emails for your course, and you can apply for drives in the student portal.'],
        rows: [['Uni. Roll No.', d.rollNo], ['Course', d.course], ['Batch', d.batch], ['Phone', d.phone], ['Interested in placement', d.placementInterest]],
        button: portalButton,
        note: 'If any detail is wrong, update it in the student portal (Registration) or contact the Placement Cell.',
      })
    case 'newStudentAlert':
      return layout({
        ...base,
        greeting: 'Hello Placement Cell,',
        subject: `New student registration — ${d.studentName || 'Student'} (${[d.course, d.batch].filter(Boolean).join(' ') || 'course not given'})`,
        eyebrow: 'New registration', title: d.studentName || 'New student', subtitle: d.studentEmail,
        paragraphs: ['A student whose email was not in the Master Data has signed up in the student portal and added their details. Please check the record in Master Data.'],
        rows: [['Name', d.studentName], ['Email', d.studentEmail], ['Uni. Roll No.', d.rollNo], ['Course', d.course], ['Batch', d.batch], ['Phone', d.phone]],
        footer: 'Sent by the GJIMT Placement LMS to the Placement Cell.',
      })
    case 'applicationReceived': {
      const register = safeUrl(d.registrationLink)
      return layout({
        ...base,
        subject: `Application received — ${d.company} | ${d.role}`,
        eyebrow: 'Application received', title: d.company, subtitle: d.role,
        paragraphs: [`Your application for ${d.role} at ${d.company} has reached the Placement Cell.`, register ? 'Important: the company also asks you to register on its own website — use the button below if you have not done it yet.' : 'The Placement Cell will update you after the company shortlists candidates.'],
        rows: [['Date of drive', formatDriveDate(d.driveDate)], ['Reporting time', formatTime(d.reportingTime)], ['Mode', d.mode], ['Venue', d.venue], ['Register on the company site by', formatDriveDate(d.applyBy)]],
        button: register ? { label: 'Register on the company site', url: register } : portalButton,
        note: 'You can withdraw your application from the student portal while it is still marked Applied.',
      })
    }
    case 'applicationStatus': {
      const line = (STATUS_LINES[d.status] || ((x) => `Your application for ${x.company} (${x.role}) is now: ${x.status}.`))(d)
      const rounds = d.roundsCleared && d.roundsTotal ? `${d.roundsCleared} of ${d.roundsTotal}` : d.roundsCleared
      return layout({
        ...base,
        subject: `${d.status === 'Selected' ? 'Congratulations! ' : ''}${d.company} — application ${String(d.status || 'update').toLowerCase()}`,
        eyebrow: 'Application update', title: d.company, subtitle: `${d.role}${d.status ? ` · ${d.status}` : ''}`,
        paragraphs: [line],
        rows: [['Status', d.status], ['Rounds cleared', rounds], ['Date of drive', formatDriveDate(d.driveDate)], ['Message from the Placement Cell', d.note]],
        button: portalButton,
      })
    }
    case 'attendanceSession':
      return layout({
        ...base,
        subject: `${d.kind || 'Session'}: ${d.title} — ${formatDriveDate(d.date, { weekday: false })}${d.time ? `, ${formatTime(d.time)}` : ''}`,
        eyebrow: d.kind || 'Placement session', title: d.title, subtitle: d.company,
        paragraphs: ['Please attend this session. Attendance is taken in the student portal — the Placement Cell will show a check-in code at the venue.'],
        rows: [['Date', formatDriveDate(d.date)], ['Time', formatTime(d.time)], ['Venue', d.venue]],
        button: portalButton,
        note: 'Sign in to the student portal and open Attendance to enter the code during the session.',
      })
    case 'code': {
      const purpose = d.purpose === 'reset' ? 'reset your password' : 'confirm your email and create your student account'
      return layout({
        ...base,
        subject: `${d.code} is your GJIMT Placement LMS code`,
        eyebrow: 'Verification code', title: d.purpose === 'reset' ? 'Reset your password' : 'Confirm your email',
        paragraphs: [`Use this code to ${purpose}. It works for ${d.minutes || 15} minutes.`],
        highlight: d.code,
        note: 'Never share this code. If you did not ask for it, you can ignore this email.',
        footer: 'Sent by the GJIMT Placement LMS.',
      })
    }
    default:
      throw new Error(`Unknown email kind "${kind}"`)
  }
}
