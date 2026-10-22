import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AdminPanelSettingsRounded, ArrowBackRounded, ArrowForwardRounded, AutoAwesomeRounded, BadgeOutlined, BusinessCenterRounded,
  CheckCircleRounded, ChevronRightRounded, EmailOutlined, HourglassTopRounded, LockRounded, MarkEmailReadRounded, PasswordRounded, SchoolRounded, ShieldRounded,
  VisibilityOffRounded, VisibilityRounded,
} from '@mui/icons-material'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { passwordProblem, passwordStrength, signUpProblems } from '../lib/authHelpers'
import { confirmCode, requestCode } from '../lib/emailCodes'
import { getGoogleConfig, renderGoogleButton } from '../lib/googleSignIn'
import { findLocalAccount, isBuiltInEmail } from '../lib/localAccounts'
import { getMailStatus } from '../lib/mailClient'
import { ROLE_INFO, canAccess, homeFor, roleLabel } from '../lib/roles'
import { afterStudentSignUp } from '../lib/studentPortal'
import LoginRail from '../components/LoginRail'

const PORTALS = [
  { role: 'admin', icon: AdminPanelSettingsRounded, title: 'Login as Admin' },
  { role: 'placement', icon: BusinessCenterRounded, title: 'Login as Placement Cell' },
  { role: 'student', icon: SchoolRounded, title: 'Login as Student' },
]
const PORTAL_ICON = Object.fromEntries(PORTALS.map((portal) => [portal.role, portal.icon]))

function PasswordInput({ id, value, onChange, show, onToggle, placeholder, autoComplete, invalid }) {
  return (
    <div className={`input-shell ${invalid ? 'invalid' : ''}`}>
      <LockRounded />
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={onChange} aria-invalid={invalid || undefined} required />
      <button type="button" className="input-action" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <VisibilityOffRounded /> : <VisibilityRounded />}</button>
    </div>
  )
}

/**
 * Google's own "Continue with Google" button (no Firebase needed). Hidden until the server has a
 * GOOGLE_CLIENT_ID, and hidden if Google's script can't load (offline).
 */
function GoogleSignInButton({ text = 'continue_with', onCredential, disabled }) {
  const box = useRef(null)
  const callback = useRef(onCredential)
  const { theme } = useTheme()
  const [state, setState] = useState('loading')
  useEffect(() => { callback.current = onCredential }, [onCredential])
  useEffect(() => {
    let alive = true
    getGoogleConfig().then(async (config) => {
      if (!alive) return
      if (!config.enabled) { setState('off'); return }
      try {
        await renderGoogleButton(box.current, { clientId: config.clientId, text, dark: theme === 'dark', onCredential: (credential) => callback.current?.(credential) })
        if (alive) setState('ready')
      } catch { if (alive) setState('off') }
    })
    return () => { alive = false }
  }, [text, theme])
  if (state === 'off') return null
  return <div className={`google-block ${disabled ? 'is-busy' : ''}`}>
    <div className="divider"><span>or</span></div>
    <div className={`gsi-button ${state}`} ref={box} aria-busy={state === 'loading'} />
  </div>
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { user, signInEmail, signUpEmail, signInGoogle, signInWithGoogleCredential, resetPassword, setNewPassword, isFirebaseConfigured } = useAuth()
  const { push } = useToast()
  const portal = ROLE_INFO[params.get('as')] ? params.get('as') : null
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const [requested, setRequested] = useState(null) // account just created, waiting for approval
  const [code, setCode] = useState('')
  const [codeToken, setCodeToken] = useState('') // signed token from the mail server (the code itself is only in the email)
  const [resendAt, setResendAt] = useState(0)

  const finishing = useRef(false) // a new student account is being linked — don't jump away mid-way
  useEffect(() => {
    if (user && !finishing.current && canAccess(user.role, homeFor(user.role))) navigate(homeFor(user.role), { replace: true })
  }, [user, navigate])

  const resetForm = () => { setError(''); setTouched(false); setShowPassword(false); setPassword(''); setConfirm(''); setRequested(null); setCode(''); setCodeToken('') }
  const choosePortal = (role) => { resetForm(); setMode('login'); setParams(role ? { as: role } : {}) }
  const switchMode = (next) => { resetForm(); setMode(next) }

  const goHome = (signedIn) => {
    const from = location.state?.from
    navigate(from && canAccess(signedIn.role, from) ? from : homeFor(signedIn.role), { replace: true })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const signedIn = await signInEmail(email, password, remember, portal)
      push(`Welcome back — your ${roleLabel(signedIn.role)} workspace is ready.`)
      goHome(signedIn)
    } catch (err) {
      setError(err?.message || 'Login failed. Please check your details.')
    } finally { setBusy(false) }
  }

  const problems = signUpProblems({ name, email, password, confirm })
  const strength = passwordStrength(password)

  /** Student account ready and signed in: link to Master Data by email, welcome email, then the portal. */
  const welcomeStudent = async (signedIn) => {
    finishing.current = true
    const record = await afterStudentSignUp(signedIn).catch(() => null)
    if (record) push(`Welcome, ${String(record.name || signedIn.displayName).split(' ')[0]}! Your account is linked to your Master Data record${record.rollNo ? ` (${record.rollNo})` : ''}.`)
    else push('Account created. Your email is not in the Master Data yet — please complete your registration.', 'info')
    navigate(record ? '/student' : '/student/registration', { replace: true })
  }

  const finishStudentSignUp = async (emailVerified) => {
    finishing.current = true
    try {
      const result = await signUpEmail({ name, email, password, confirm, role: 'student', emailVerified })
      await welcomeStudent(result.signedIn)
    } finally { finishing.current = false }
  }

  const sendCode = async (purpose) => {
    const { token } = await requestCode(email, name, purpose)
    setCodeToken(token); setCode(''); setResendAt(Date.now() + 30000)
  }

  const signUp = async (event) => {
    event.preventDefault()
    setTouched(true)
    setError('')
    if (Object.keys(problems).length) return
    setBusy(true)
    try {
      if (portal === 'student' && !isFirebaseConfigured) {
        if (isBuiltInEmail(email) || findLocalAccount(email)) throw new Error('An account with this email already exists — sign in instead.')
        // Email set up → prove the email with a code first; otherwise create the account straight away
        if ((await getMailStatus()).configured) { await sendCode('signup'); setMode('verify'); return }
        await finishStudentSignUp(false)
        return
      }
      finishing.current = portal === 'student'
      const result = await signUpEmail({ name, email, password, confirm, role: portal }).finally(() => { finishing.current = false })
      if (result.signedIn) { await welcomeStudent(result.signedIn); return }
      setRequested({ ...result.account, verificationSent: result.verificationSent })
      setPassword(''); setConfirm('')
    } catch (err) {
      setError(err?.message || 'Your account could not be created.')
    } finally { setBusy(false) }
  }

  const verifySignUp = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await confirmCode(email, code, codeToken, 'signup')
      await finishStudentSignUp(true)
    } catch (err) {
      setError(err?.message || 'That code could not be checked.')
    } finally { setBusy(false) }
  }

  const resend = async (purpose) => {
    setError('')
    if (Date.now() < resendAt) { setError('Please wait a few seconds before asking for another code.'); return }
    setBusy(true)
    try { await sendCode(purpose); push('A new code is on its way.', 'info') } catch (err) { setError(err?.message || 'The code could not be sent.') } finally { setBusy(false) }
  }

  const googleLogin = async () => {
    setError('')
    setBusy(true)
    try { const signedIn = await signInGoogle(remember, portal); if (signedIn) goHome(signedIn) }
    catch (err) { setError(err?.message || 'Google sign-in failed.') }
    finally { setBusy(false) }
  }

  /** Google answered (account picked): open or sign in the student account, then the portal. */
  const googleCredential = async (credential) => {
    setError('')
    setBusy(true)
    finishing.current = true
    try {
      const { signedIn, created } = await signInWithGoogleCredential(credential, portal, remember)
      if (created) await welcomeStudent(signedIn)
      else { push(`Welcome back — your ${roleLabel(signedIn.role)} workspace is ready.`); goHome(signedIn) }
    } catch (err) {
      setError(err?.message || 'Google sign-in failed.')
    } finally { finishing.current = false; setBusy(false) }
  }

  const forgot = async () => {
    setError('')
    if (!email.trim()) { setError('Enter your email first, then use Forgot password.'); return }
    if (!isFirebaseConfigured) {
      if (isBuiltInEmail(email)) { setError('This is a built-in account — its password is changed by the system administrator.'); return }
      if (!findLocalAccount(email)) { setError('No account found for this email.'); return }
    }
    setBusy(true)
    try {
      if (isFirebaseConfigured) { await resetPassword(email); push('Password reset email sent. Check your inbox.'); return }
      if (!(await getMailStatus()).configured) throw new Error(`Password reset by email works once the college email is set up. Please ask the ${portal === 'student' ? 'Placement Cell' : 'Admin'} for help.`)
      await sendCode('reset')
      setPassword(''); setConfirm(''); setTouched(false); setMode('forgot')
      push('We emailed you a 6-digit code.', 'info')
    } catch (err) { setError(err?.message || 'Password reset could not be sent.') }
    finally { setBusy(false) }
  }

  const resetSubmit = async (event) => {
    event.preventDefault()
    setTouched(true)
    setError('')
    const problem = passwordProblem(password) || (password !== confirm ? 'Passwords do not match.' : '')
    if (problem) { setError(problem); return }
    setBusy(true)
    try {
      await confirmCode(email, code, codeToken, 'reset')
      await setNewPassword(email, password)
      push('Password changed — sign in with your new password.')
      setPassword(''); setConfirm(''); setCode(''); setCodeToken(''); setTouched(false); setMode('login')
    } catch (err) {
      setError(err?.message || 'The password could not be changed.')
    } finally { setBusy(false) }
  }

  const show = (field) => touched && problems[field]
  const info = portal ? ROLE_INFO[portal] : null
  const PortalIcon = portal ? PORTAL_ICON[portal] : null
  const canSignUp = Boolean(info?.signUp)

  const isStudent = portal === 'student'
  const heading = !portal
    ? { eyebrow: 'GJIMT Placement LMS', title: 'Choose your portal', text: 'Sign in to the area that matches your role.' }
    : requested
      ? { eyebrow: `${info.label} portal`, title: 'Request sent', text: 'Your account is waiting for the Admin’s approval.' }
      : mode === 'verify'
        ? { eyebrow: `${info.label} portal`, title: 'Check your email', text: `We sent a 6-digit code to ${email.trim()}.` }
        : mode === 'forgot'
          ? { eyebrow: `${info.label} portal`, title: 'Reset your password', text: `Enter the code we emailed to ${email.trim()} and choose a new password.` }
          : mode === 'signup'
            ? isStudent
              ? { eyebrow: 'Student portal', title: 'Create your student account', text: 'Use the email you gave the college — if it is in the Master Data, your record is linked automatically.' }
              : { eyebrow: `${info.label} portal`, title: 'Create your account', text: 'The Admin approves new Placement Cell accounts before first sign-in.' }
            : { eyebrow: `${info.label} portal`, title: 'Welcome back', text: isStudent ? 'Sign in to register, apply for placement drives and mark attendance.' : `Sign in to the ${info.label} workspace.` }

  return (
    <div className="login-page">
      <div className="login-layout">
        <div className="login-card-shell">
          <section className="login-showcase" aria-label="About the GJIMT Placement LMS">
            <div className="login-brand-row">
              <span className="logo-plate"><img src="/gjimt-brand.png" alt="GJIMT — NAAC accredited" className="login-brand" /></span>
              <span className="brand-pill"><ShieldRounded /> Verified campus portal</span>
            </div>
            <div className="showcase-copy">
              <span className="showcase-kicker"><AutoAwesomeRounded /> Built for your placement journey</span>
              <h1>Learn. Prepare.<br /><em>Get placed.</em></h1>
              <p>One refined workspace for internships, placement drives, student records, industry connect and career-readiness activities.</p>
            </div>
            <div className="showcase-highlights">
              <div><strong>01</strong><span>Centralised student data</span></div>
              <div><strong>02</strong><span>Faster placement coordination</span></div>
              <div><strong>03</strong><span>Role-based secure sign-in</span></div>
            </div>
            <div className="showcase-footer"><span>Gian Jyoti Institute of Management &amp; Technology</span><span className="motto">Aspire · Achieve · Ascend</span></div>
          </section>

          <section className="login-form-panel">
            {portal && <div className="portal-bar">
              <button type="button" className="portal-back" onClick={() => choosePortal(null)}><ArrowBackRounded /> All portals</button>
              <span className={`portal-chip ${portal}`}><PortalIcon /> {info.label}</span>
            </div>}
            <div className="login-head">
              <span className="login-eyebrow">{heading.eyebrow}</span>
              <h2>{heading.title}</h2>
              <p>{heading.text}</p>
            </div>

            {!portal && <div className="portal-list">
              {PORTALS.map(({ role, icon: Icon, title }) => (
                <button key={role} type="button" className={`portal-option ${role}`} onClick={() => choosePortal(role)}>
                  <span className="portal-icon"><Icon /></span>
                  <span className="portal-text"><strong>{title}</strong><small>{ROLE_INFO[role].blurb}</small></span>
                  <ChevronRightRounded className="portal-arrow" />
                </button>
              ))}
            </div>}

            {portal && requested && <div className="request-panel" role="status">
              <span className="request-icon"><HourglassTopRounded /></span>
              <p><strong>{requested.name}</strong>, your Placement Cell account (<span>{requested.email}</span>) has been created.</p>
              <p>The Admin needs to approve it before you can sign in.{requested.verificationSent ? ' We also sent a link to verify your email.' : ''}</p>
              <button type="button" className="primary-login" onClick={() => { setRequested(null); setMode('login') }}><span>Back to sign in</span><ArrowForwardRounded /></button>
            </div>}

            {portal && !requested && canSignUp && ['login', 'signup'].includes(mode) && <div className="auth-tabs" role="tablist" aria-label="Sign-in options">
              <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button>
              <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Create account</button>
            </div>}

            {portal && !requested && mode === 'login' && <form className="login-form" onSubmit={submit}>
              <label className="field-label" htmlFor="login-email">{isStudent ? 'Email' : 'Login ID'}</label>
              <div className="input-shell"><EmailOutlined /><input id="login-email" type="email" autoComplete="username" placeholder={isStudent ? 'The email you gave the college' : 'name@gjimt.ac.in'} value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} required /></div>
              <div className="password-row"><label className="field-label" htmlFor="login-password">Password</label><button type="button" className="forgot-link" onClick={forgot}>Forgot password?</button></div>
              <PasswordInput id="login-password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="Enter your password" autoComplete="current-password" />
              <div className="remember-row"><label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>Remember me</span></label></div>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary-login" disabled={busy} type="submit"><span>{busy ? 'Signing in…' : `Sign in as ${info.label}`}</span><ArrowForwardRounded /></button>
              {isFirebaseConfigured && <>
                <div className="divider"><span>or</span></div>
                <button className="google-login" type="button" onClick={googleLogin} disabled={busy}><GoogleMark /><span>Continue with Google</span></button>
              </>}
              {!isFirebaseConfigured && isStudent && <GoogleSignInButton text="continue_with" onCredential={googleCredential} disabled={busy} />}
              {canSignUp && <p className="switch-auth">{isStudent ? 'New here?' : 'New to the Placement Cell?'} <button type="button" onClick={() => switchMode('signup')}>{isStudent ? 'Create your student account' : 'Create an account'}</button></p>}
              {!canSignUp && <p className="switch-auth muted">Admin accounts are set up by the college. Forgot the password? Contact the system administrator.</p>}
            </form>}

            {portal && !requested && mode === 'signup' && <form className="login-form signup-form" onSubmit={signUp} noValidate>
              <label className="field-label" htmlFor="signup-name">Full name</label>
              <div className={`input-shell ${show('name') ? 'invalid' : ''}`}><BadgeOutlined /><input id="signup-name" autoComplete="name" placeholder="e.g. Simran Kaur" value={name} onChange={(e) => { setName(e.target.value); setError('') }} aria-invalid={Boolean(show('name')) || undefined} required /></div>
              {show('name') && <span className="field-hint error">{problems.name}</span>}

              <label className="field-label spaced" htmlFor="signup-email">Email</label>
              <div className={`input-shell ${show('email') ? 'invalid' : ''}`}><EmailOutlined /><input id="signup-email" type="email" autoComplete="email" placeholder={isStudent ? 'The email you gave the college' : 'you@gjimt.ac.in'} value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} aria-invalid={Boolean(show('email')) || undefined} required /></div>
              {show('email') ? <span className="field-hint error">{problems.email}</span> : isStudent && <span className="field-hint">Same email as in the college records = your existing record is used.</span>}

              <label className="field-label spaced" htmlFor="signup-password">Password</label>
              <PasswordInput id="signup-password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="At least 8 characters" autoComplete="new-password" invalid={Boolean(show('password'))} />
              {password && <div className={`strength s${strength.score}`} aria-live="polite"><span className="strength-bars"><i /><i /><i /><i /></span><span>{strength.label} password</span></div>}
              <span className={`field-hint ${show('password') ? 'error' : ''}`}>{show('password') ? problems.password : 'Use 8+ characters with at least one letter and one number.'}</span>

              <label className="field-label spaced" htmlFor="signup-confirm">Confirm password</label>
              <PasswordInput id="signup-confirm" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="Type it again" autoComplete="new-password" invalid={Boolean(show('confirm'))} />
              {show('confirm') && <span className="field-hint error">{problems.confirm}</span>}
              {!problems.confirm && confirm && !problems.password && <span className="field-hint ok"><CheckCircleRounded /> Passwords match</span>}

              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary-login spaced-top" disabled={busy} type="submit"><span>{busy ? (isStudent ? 'Creating account…' : 'Sending request…') : 'Create account'}</span><ArrowForwardRounded /></button>
              {isStudent && (isFirebaseConfigured
                ? <><div className="divider"><span>or</span></div><button className="google-login" type="button" onClick={googleLogin} disabled={busy}><GoogleMark /><span>Sign up with Google</span></button></>
                : <GoogleSignInButton text="signup_with" onCredential={googleCredential} disabled={busy} />)}
              <p className="switch-auth">Already have an account? <button type="button" onClick={() => switchMode('login')}>Sign in</button></p>
              <p className="secure-note">{isStudent ? 'Students can sign in straight away. If your email isn’t in the college records yet, you’ll be asked for your full details next.' : 'New accounts can sign in after the Admin approves them.'}</p>
            </form>}

            {portal && !requested && mode === 'verify' && <form className="login-form code-form" onSubmit={verifySignUp}>
              <span className="code-icon"><MarkEmailReadRounded /></span>
              <label className="field-label" htmlFor="signup-code">6-digit code</label>
              <div className="input-shell code-shell"><PasswordRounded /><input id="signup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} required /></div>
              <span className="field-hint">The code works for 15 minutes. Check the spam folder if it isn’t in your inbox.</span>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary-login spaced-top" disabled={busy || code.length !== 6} type="submit"><span>{busy ? 'Checking…' : 'Verify & create account'}</span><ArrowForwardRounded /></button>
              <p className="switch-auth"><button type="button" onClick={() => resend('signup')} disabled={busy}>Send a new code</button> · <button type="button" onClick={() => { setError(''); setMode('signup') }}>Change email</button></p>
            </form>}

            {portal && !requested && mode === 'forgot' && <form className="login-form code-form" onSubmit={resetSubmit} noValidate>
              <label className="field-label" htmlFor="reset-code">6-digit code</label>
              <div className="input-shell code-shell"><PasswordRounded /><input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} required /></div>
              <label className="field-label spaced" htmlFor="reset-password">New password</label>
              <PasswordInput id="reset-password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="At least 8 characters" autoComplete="new-password" invalid={touched && Boolean(passwordProblem(password))} />
              <label className="field-label spaced" htmlFor="reset-confirm">Confirm new password</label>
              <PasswordInput id="reset-confirm" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} show={showPassword} onToggle={() => setShowPassword((value) => !value)} placeholder="Type it again" autoComplete="new-password" invalid={touched && password !== confirm} />
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary-login spaced-top" disabled={busy || code.length !== 6} type="submit"><span>{busy ? 'Saving…' : 'Set new password'}</span><ArrowForwardRounded /></button>
              <p className="switch-auth"><button type="button" onClick={() => resend('reset')} disabled={busy}>Send a new code</button> · <button type="button" onClick={() => switchMode('login')}>Back to sign in</button></p>
            </form>}

            <div className="login-bottom-note"><span>© {new Date().getFullYear()} GJIMT Placement Cell</span></div>
          </section>
        </div>
        <LoginRail />
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
