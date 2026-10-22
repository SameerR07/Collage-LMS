import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  getRedirectResult,
} from 'firebase/auth'
import { auth, demoEmail, demoPassword, isFirebaseConfigured } from '../lib/firebase'

const DEMO_SESSION_KEY = 'gjimt:lms:demo-session'
const AuthContext = createContext(null)

const getStoredDemoUser = () => {
  const raw = localStorage.getItem(DEMO_SESSION_KEY) || sessionStorage.getItem(DEMO_SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}

const saveDemoSession = (user, remember) => {
  const payload = JSON.stringify(user)
  localStorage.removeItem(DEMO_SESSION_KEY)
  sessionStorage.removeItem(DEMO_SESSION_KEY)
  ;(remember ? localStorage : sessionStorage).setItem(DEMO_SESSION_KEY, payload)
}

const clearDemoSession = () => {
  localStorage.removeItem(DEMO_SESSION_KEY)
  sessionStorage.removeItem(DEMO_SESSION_KEY)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let unsubscribe = () => {}

    if (!isFirebaseConfigured) {
      setUser(getStoredDemoUser())
      setLoading(false)
      return undefined
    }

    unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    getRedirectResult(auth).catch((error) => {
      if (error?.code !== 'auth/no-auth-event') {
        setAuthError(error?.message || 'Google sign-in could not be completed.')
      }
    })

    return () => unsubscribe()
  }, [])

  const signInEmail = async (email, password, remember = true) => {
    setAuthError('')

    if (!isFirebaseConfigured) {
      if (email.trim().toLowerCase() === demoEmail.toLowerCase() && password === demoPassword) {
        const demoUser = {
          uid: 'demo-placement-cell',
          displayName: 'Placement Cell Demo',
          email: demoEmail,
          photoURL: '',
          providerId: 'demo',
        }
        saveDemoSession(demoUser, remember)
        setUser(demoUser)
        return demoUser
      }
      throw new Error('Invalid demo Login ID or Password. Use the demo credentials shown below.')
    }

    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    const result = await signInWithEmailAndPassword(auth, email.trim(), password)
    setUser(result.user)
    return result.user
  }

  const signInGoogle = async (remember = true) => {
    setAuthError('')
    if (!isFirebaseConfigured) {
      throw new Error('Google Login is ready in the code but needs your Firebase project configuration first.')
    }

    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })

    try {
      const result = await signInWithPopup(auth, provider)
      setUser(result.user)
      return result.user
    } catch (error) {
      if (error?.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider)
        return null
      }
      throw error
    }
  }

  const resetPassword = async (email) => {
    setAuthError('')
    if (!isFirebaseConfigured) {
      throw new Error('Password reset is enabled after Firebase is configured.')
    }
    await sendPasswordResetEmail(auth, email.trim())
  }

  const logout = async () => {
    clearDemoSession()
    if (isFirebaseConfigured) {
      await signOut(auth)
    }
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      isFirebaseConfigured,
      demoEmail,
      demoPassword,
      signInEmail,
      signInGoogle,
      resetPassword,
      logout,
    }),
    [user, loading, authError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
