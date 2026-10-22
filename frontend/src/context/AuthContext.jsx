import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../lib/firebase'
import { friendlyAuthError, signUpProblems } from '../lib/authHelpers'
import { createLocalAccount, findLocalAccount, isBuiltInEmail, markGoogleAccount, setLocalPassword, unusablePassword, verifyAccount } from '../lib/localAccounts'
import { verifyGoogleCredential } from '../lib/googleSignIn'
import { ROLE_INFO, isRole, signInProblem } from '../lib/roles'
import { schedulePublicStatsRefresh } from '../lib/dataStore'
import { endSession, isTracking, logFailedSignIn, logFor, resumeSession, startSession } from '../lib/activity'

const SESSION_KEY = 'gjimt:lms:session'
const OLD_SESSION_KEY = 'gjimt:lms:demo-session' // before roles — no longer accepted
const AuthContext = createContext(null)

// Signed-in person as the app sees them (local / built-in accounts)
const localSessionUser = (account) => ({
  uid: account.uid,
  displayName: account.name,
  email: account.email,
  photoURL: account.photoURL || '',
  providerId: account.builtIn ? 'builtin' : 'local',
  builtIn: Boolean(account.builtIn),
  role: account.role,
  status: account.status,
  emailVerified: Boolean(account.emailVerified),
  createdAt: account.createdAt,
  signedInAt: new Date().toISOString(),
})

// Firebase user + role from users/{uid}
const firebaseSessionUser = (firebaseUser, profile) => ({
  uid: firebaseUser.uid,
  displayName: firebaseUser.displayName || profile?.name || '',
  email: firebaseUser.email,
  photoURL: firebaseUser.photoURL || '',
  emailVerified: firebaseUser.emailVerified,
  providerData: firebaseUser.providerData,
  metadata: firebaseUser.metadata,
  providerId: 'firebase',
  builtIn: false,
  role: profile?.role,
  status: profile?.status,
})

const clearSession = () => {
  ;[SESSION_KEY, OLD_SESSION_KEY].forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key) })
}
const saveSession = (user, remember) => {
  clearSession()
  ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(user))
}

/** Saved local session — only if the account still exists, is active and has the same role. */
const restoreLocalSession = () => {
  localStorage.removeItem(OLD_SESSION_KEY); sessionStorage.removeItem(OLD_SESSION_KEY)
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
    const saved = raw ? JSON.parse(raw) : null
    if (!saved || !isRole(saved.role)) return null
    if (saved.builtIn) return isBuiltInEmail(saved.email) ? saved : null
    const account = findLocalAccount(saved.email)
    if (!account || account.status !== 'active' || account.role !== saved.role) { clearSession(); return null }
    return saved
  } catch { return null }
}

async function readProfile(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid))
  return snapshot.exists() ? snapshot.data() : null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (isFirebaseConfigured ? null : restoreLocalSession()))
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const signingIn = useRef(false) // a sign-in is starting its own activity-log session

  // Activity log: someone still signed in (page reload, app reopened) carries on / starts a session record
  useEffect(() => {
    if (user && !signingIn.current && !isTracking(user)) resumeSession(user).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined
    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) { setUser(null); setLoading(false); return }
      try {
        const profile = await readProfile(nextUser.uid)
        if (signInProblem(profile && { role: profile.role, status: profile.status })) { await signOut(auth); setUser(null) }
        else {
          setUser(firebaseSessionUser(nextUser, profile))
          schedulePublicStatsRefresh(3000) // keep the login-page numbers current for existing data
        }
      } catch {
        await signOut(auth); setUser(null)
      } finally { setLoading(false) }
    })
  }, [])

  /** Sign in through the portal the person chose (admin / placement). */
  const signInEmail = async (email, password, remember = true, chosenRole) => {
    if (!isFirebaseConfigured) {
      let account
      try {
        account = await verifyAccount(email, password)
        const problem = signInProblem(account, chosenRole)
        if (problem) throw new Error(problem)
      } catch (error) {
        await logFailedSignIn(email, chosenRole, error.message)
        // Opened with Google and never given a password
        if (/incorrect/.test(error.message) && findLocalAccount(email)?.google) throw new Error('This account uses “Continue with Google”. Use that button, or set a password with “Forgot password?”.')
        throw error
      }
      const sessionUser = localSessionUser(account)
      saveSession(sessionUser, remember)
      await startSession(sessionUser, { remember })
      setUser(sessionUser)
      return sessionUser
    }
    let result
    signingIn.current = true
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
      result = await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (error) {
      signingIn.current = false
      throw new Error(friendlyAuthError(error, 'Sign-in failed. Please check your details.'))
    }
    try {
      const profile = await readProfile(result.user.uid).catch(() => null)
      const problem = signInProblem(profile ? { role: profile.role, status: profile.status } : { role: 'placement', status: 'pending' }, chosenRole)
      if (problem) { await signOut(auth); throw new Error(problem) }
      const sessionUser = firebaseSessionUser(result.user, profile)
      await startSession(sessionUser, { remember })
      setUser(sessionUser)
      return sessionUser
    } finally { signingIn.current = false }
  }

  /**
   * New accounts. Placement Cell: waiting for the Admin's approval (no sign-in yet).
   * Student: active straight away and signed in — the email links them to their Master Data record.
   * emailVerified: the student already proved the email with an emailed code (local mode).
   */
  const signUpEmail = async ({ name, email, password, confirm = password, role = 'placement', emailVerified = false }) => {
    if (!ROLE_INFO[role]?.signUp) throw new Error('New accounts for this portal are created by the Admin.')
    const problems = signUpProblems({ name, email, password, confirm })
    const firstProblem = Object.values(problems)[0]
    if (firstProblem) throw new Error(firstProblem)
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const status = ROLE_INFO[role].autoActive ? 'active' : 'pending'

    if (!isFirebaseConfigured) {
      const account = await createLocalAccount({ name: cleanName, email, password, role, status, emailVerified })
      if (status !== 'active') {
        await logFor(account, `Asked for a ${ROLE_INFO[role].label} account`, { category: 'sign-in', area: 'Login', detail: 'Waiting for the Admin’s approval' })
        return { account, pending: true, verificationSent: false }
      }
      const sessionUser = localSessionUser(account)
      saveSession(sessionUser, true)
      await startSession(sessionUser, { remember: true, note: `New ${ROLE_INFO[role].label.toLowerCase()} account${emailVerified ? ' (email confirmed with a code)' : ''}` })
      setUser(sessionUser)
      return { account, pending: false, signedIn: sessionUser, verificationSent: false }
    }

    if (isBuiltInEmail(email)) throw new Error('This email is reserved. Please use a different email.')
    signingIn.current = true
    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await updateProfile(result.user, { displayName: cleanName })
      const profile = { name: cleanName, email: result.user.email, role, status, createdAt: new Date().toISOString() }
      await setDoc(doc(db, 'users', result.user.uid), profile)
      let verificationSent = false
      try { await sendEmailVerification(result.user); verificationSent = true } catch { /* can be re-sent later */ }
      if (status !== 'active') {
        await logFor({ ...profile, uid: result.user.uid }, `Asked for a ${ROLE_INFO[role].label} account`, { category: 'sign-in', area: 'Login', detail: 'Waiting for the Admin’s approval' })
        await signOut(auth)
        return { account: profile, pending: true, verificationSent }
      }
      const sessionUser = firebaseSessionUser(result.user, profile)
      await startSession(sessionUser, { remember: true, note: `New ${ROLE_INFO[role].label.toLowerCase()} account` })
      setUser(sessionUser)
      return { account: profile, pending: false, signedIn: sessionUser, verificationSent }
    } catch (error) {
      throw new Error(friendlyAuthError(error, 'Your account could not be created.'))
    } finally { signingIn.current = false }
  }

  /**
   * "Continue with Google" without Firebase: the server checks Google's ID token, then the account is
   * opened (students, first time) or signed in. Returns { signedIn, created }.
   */
  const signInWithGoogleCredential = async (credential, chosenRole = 'student', remember = true) => {
    const profile = await verifyGoogleCredential(credential)
    if (isBuiltInEmail(profile.email)) throw new Error('This email is reserved for a built-in account — sign in with its password.')
    let account = findLocalAccount(profile.email)
    let created = false
    if (account) {
      const problem = signInProblem(account, chosenRole)
      if (problem) { await logFailedSignIn(profile.email, chosenRole, `${problem} (Google)`); throw new Error(problem) }
      account = markGoogleAccount(profile.email, { photoURL: profile.picture })
    } else {
      if (!ROLE_INFO[chosenRole]?.autoActive) throw new Error('No account found for this Google email. Create an account first; the Admin approves it.')
      account = await createLocalAccount({ name: profile.name || profile.email.split('@')[0], email: profile.email, password: unusablePassword(), role: chosenRole, status: 'active', emailVerified: true, google: true, photoURL: profile.picture })
      created = true
    }
    const sessionUser = localSessionUser(account)
    saveSession(sessionUser, remember)
    await startSession(sessionUser, { remember, note: created ? `New ${ROLE_INFO[chosenRole].label.toLowerCase()} account with Google` : 'Continue with Google' })
    setUser(sessionUser)
    return { signedIn: sessionUser, created }
  }

  /** Local mode: new password after the emailed code was checked. */
  const setNewPassword = async (email, password) => {
    if (isFirebaseConfigured) throw new Error('Use the reset link sent to your email.')
    const account = await setLocalPassword(email, password)
    await logFor(account, 'Changed the password with an emailed code', { category: 'sign-in', area: 'Login' })
    return account
  }

  /** Firebase: re-read the account after the person clicked the verification link. */
  const reloadUser = async () => {
    if (!isFirebaseConfigured || !auth.currentUser) return null
    await auth.currentUser.reload()
    const profile = await readProfile(auth.currentUser.uid).catch(() => null)
    const next = firebaseSessionUser(auth.currentUser, profile)
    setUser(next)
    return next
  }

  const resendVerification = async () => {
    if (!isFirebaseConfigured || !auth.currentUser) return
    await sendEmailVerification(auth.currentUser)
  }

  const signInGoogle = async (remember = true, chosenRole) => {
    if (!isFirebaseConfigured) throw new Error('Google sign-in works once Firebase is connected.')
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    let result
    signingIn.current = true
    try { result = await signInWithPopup(auth, provider) } catch (error) { signingIn.current = false; throw new Error(friendlyAuthError(error, 'Google sign-in failed.')) }
    try {
      let profile = await readProfile(result.user.uid).catch(() => null)
      if (!profile) {
        const asStudent = chosenRole === 'student' // Google emails are already verified; students start active
        profile = { name: result.user.displayName || '', email: result.user.email, role: asStudent ? 'student' : 'placement', status: asStudent ? 'active' : 'pending', createdAt: new Date().toISOString() }
        await setDoc(doc(db, 'users', result.user.uid), profile).catch(() => {})
      }
      const problem = signInProblem({ role: profile.role, status: profile.status }, chosenRole)
      if (problem) { await signOut(auth); throw new Error(problem) }
      const sessionUser = firebaseSessionUser(result.user, profile)
      await startSession(sessionUser, { remember, note: 'Google sign-in' })
      setUser(sessionUser)
      return sessionUser
    } finally { signingIn.current = false }
  }

  const resetPassword = async (email) => {
    if (!isFirebaseConfigured) throw new Error('Password reset by email works once Firebase is connected. Ask the Admin for help.')
    try { await sendPasswordResetEmail(auth, email.trim()) } catch (error) { throw new Error(friendlyAuthError(error, 'Password reset could not be sent.')) }
  }

  const logout = async () => {
    await endSession('Signed out').catch(() => {})
    clearSession()
    if (isFirebaseConfigured) await signOut(auth)
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      role: user?.role || null,
      loading,
      isFirebaseConfigured,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signInWithGoogleCredential,
      resetPassword,
      setNewPassword,
      reloadUser,
      resendVerification,
      logout,
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
