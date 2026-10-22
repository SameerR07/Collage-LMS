import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MarkEmailUnreadRounded, RefreshRounded } from '@mui/icons-material'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { loadStudentRecord } from '../lib/studentPortal'

/**
 * Wraps every student page. Finds the student's Master Data record by their email.
 * - no record yet → sent to Registration first (unless allowWithoutRecord)
 * - Firebase: the email must be verified before the portal opens
 * children: ({ record, reload, setRecord }) => page
 */
export default function StudentGate({ children, allowWithoutRecord = false }) {
  const { user, isFirebaseConfigured, reloadUser, resendVerification } = useAuth()
  const { push } = useToast()
  const [state, setState] = useState({ loading: true, record: null })

  const reload = useCallback(() => loadStudentRecord(user?.email).catch(() => null).then((record) => { setState({ loading: false, record }); return record }), [user?.email])
  const setRecord = useCallback((record) => setState({ loading: false, record }), [])

  useEffect(() => {
    let alive = true
    loadStudentRecord(user?.email).catch(() => null).then((record) => { if (alive) setState({ loading: false, record }) })
    return () => { alive = false }
  }, [user?.email])

  if (isFirebaseConfigured && user && !user.emailVerified) {
    return <section className="surface-card verify-email-card">
      <span className="verify-icon"><MarkEmailUnreadRounded /></span>
      <h3>Verify your email to continue</h3>
      <p>We sent a link to <strong>{user.email}</strong>. Open it, then come back and press Continue.</p>
      <div className="banner-button-row">
        <button type="button" className="primary-button" onClick={async () => { const next = await reloadUser(); if (!next?.emailVerified) push('Not verified yet — open the link in the email first.', 'info') }}><RefreshRounded /> Continue</button>
        <button type="button" className="soft-button" onClick={async () => { try { await resendVerification(); push('Verification email sent again.', 'info') } catch { push('Please wait a minute before asking again.', 'error') } }}>Send the link again</button>
      </div>
    </section>
  }
  if (state.loading) {
    return <div className="skeleton-table" aria-busy="true" aria-label="Loading your details">{[0, 1, 2].map((index) => <div className="skeleton-row" key={index}><span className="skeleton-avatar" /><span className="skeleton-line wide" /><span className="skeleton-pill" /></div>)}</div>
  }
  if (!state.record && !allowWithoutRecord) return <Navigate to="/student/registration" replace />
  return children({ record: state.record, reload, setRecord })
}
