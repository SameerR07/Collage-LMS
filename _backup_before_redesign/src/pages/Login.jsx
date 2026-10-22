import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowForwardRounded, AutoAwesomeRounded, EmailOutlined, Google, LockRounded, ShieldRounded, VisibilityOffRounded, VisibilityRounded } from '@mui/icons-material'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function Login() {
  const navigate = useNavigate()
  const { user, signInEmail, signInGoogle, resetPassword, demoEmail, demoPassword, isFirebaseConfigured } = useAuth()
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signInEmail(email, password, remember)
      push('Welcome back — your workspace is ready.')
      navigate('/')
    } catch (err) {
      setError(err?.message?.replace(/^Firebase:\s*/i, '') || 'Login failed. Please check your details.')
    } finally { setBusy(false) }
  }

  const googleLogin = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await signInGoogle(remember)
      if (result) navigate('/')
    } catch (err) {
      setError(err?.message?.replace(/^Firebase:\s*/i, '') || 'Google Login failed.')
    } finally { setBusy(false) }
  }

  const forgot = async () => {
    setError('')
    if (!email.trim()) { setError('Enter your email first, then use Forgot password.'); return }
    setBusy(true)
    try { await resetPassword(email); push('Password reset email sent. Check your inbox.') }
    catch (err) { setError(err?.message || 'Password reset could not be sent.') }
    finally { setBusy(false) }
  }

  const fillDemo = () => { setEmail(demoEmail); setPassword(demoPassword); setError(''); push('Demo credentials filled in.') }

  return (
    <div className="login-page">
      <div className="login-bg-orb login-orb-one" /><div className="login-bg-orb login-orb-two" />
      <div className="login-card-shell">
        <section className="login-showcase">
          <div className="login-brand-row"><img src="/gjimt-brand.png" alt="GJIMT and NAAC" className="login-brand" /><span className="brand-pill"><ShieldRounded /> Verified campus portal</span></div>
          <div className="showcase-copy"><span className="showcase-kicker"><AutoAwesomeRounded /> Built for your placement journey</span><h1>Learn. Prepare.<br /><span>Get Placed.</span></h1><p>One clean workspace for internships, placement drives, student records, industry connect and career-readiness activities.</p></div>
          <div className="showcase-highlights"><div><strong>01</strong><span>Centralised student data</span></div><div><strong>02</strong><span>Faster placement coordination</span></div><div><strong>03</strong><span>Google + secure login</span></div></div>
          <div className="showcase-footer"><span>Gian Jyoti Institute of Management &amp; Technology</span><span>Aspire. Achieve. Ascend.</span></div>
        </section>

        <section className="login-form-panel">
          <div className="login-top-mobile"><img src="/gjimt-brand.png" alt="GJIMT and NAAC" /></div>
          <div className="login-head"><div className="login-icon-badge"><LockRounded /></div><div><span className="login-eyebrow">Placement Cell</span><h2>Welcome back!</h2><p>Sign in to continue to your Placement LMS.</p></div></div>
          <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button><span>•</span><button className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}>Demo access</button></div>

          {mode === 'demo' ? <div className="demo-panel">
            <div className="demo-panel-top"><span className="demo-chip">Demo account</span><span className="demo-status">{isFirebaseConfigured ? 'Create this user in Firebase' : 'Works now in local demo mode'}</span></div>
            <p>Use this account to show your teacher the working dashboard before real college credentials are connected.</p>
            <div className="demo-row"><span>Login ID</span><code>{demoEmail}</code></div><div className="demo-row"><span>Password</span><code>{demoPassword}</code></div>
            <button className="demo-fill" onClick={() => { fillDemo(); setMode('login') }}>Use these credentials <ArrowForwardRounded /></button>
          </div> : <form className="login-form" onSubmit={submit}>
            <label className="field-label" htmlFor="login-email">Login ID</label>
            <div className="input-shell"><EmailOutlined /><input id="login-email" type="email" autoComplete="username" placeholder="Enter your login ID" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} required /></div>
            <div className="password-row"><label className="field-label" htmlFor="login-password">Password</label><button type="button" className="forgot-link" onClick={forgot}>Forgot password?</button></div>
            <div className="input-shell"><LockRounded /><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} required /><button type="button" className="input-action" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}</button></div>
            <div className="remember-row"><label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>Remember me</span></label>{!isFirebaseConfigured && <button type="button" onClick={fillDemo}>Fill demo login</button>}</div>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-login" disabled={busy} type="submit"><span>{busy ? 'Signing in…' : 'Sign in'}</span><ArrowForwardRounded /></button>
            <div className="divider"><span>or continue with</span></div>
            <button className="google-login" type="button" onClick={googleLogin} disabled={busy}><Google /><span>Continue with Google</span></button>
            <p className="secure-note"><ShieldRounded /> Your account is authenticated through Firebase when connected.</p>
          </form>}
          <div className="login-bottom-note"><span>© 2026 GJIMT Placement Cell</span><span>{isFirebaseConfigured ? 'Cloud auth connected' : 'Local demo mode'}</span></div>
        </section>
      </div>
    </div>
  )
}
