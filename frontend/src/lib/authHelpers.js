/* =========================================================
   Sign-up / sign-in helpers shared by the login page and AuthContext
========================================================= */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const isValidEmail = (email) => EMAIL_PATTERN.test(String(email || '').trim())

/** First rule the password breaks, or '' when it is acceptable (8+ characters with a letter and a number). */
export function passwordProblem(password = '') {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password)) return 'Add at least one letter.'
  if (!/\d/.test(password)) return 'Add at least one number.'
  return ''
}

/** 0–4 score with a label, for the strength meter under the password field. */
export function passwordStrength(password = '') {
  if (!password) return { score: 0, label: '' }
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1
  if (passwordProblem(password)) score = Math.min(score, 1)
  return { score: Math.max(1, score), label: ['', 'Weak', 'Fair', 'Good', 'Strong'][Math.max(1, score)] }
}

/** Check the whole sign-up form; returns { field: message } for anything wrong. */
export function signUpProblems({ name = '', email = '', password = '', confirm = '' }) {
  const problems = {}
  if (name.trim().length < 2) problems.name = 'Enter your full name.'
  if (!isValidEmail(email)) problems.email = 'Enter a valid email address.'
  const weak = passwordProblem(password)
  if (weak) problems.password = weak
  if (!problems.password && confirm !== password) problems.confirm = 'Passwords do not match.'
  return problems
}

/** Firebase error codes → messages a non-technical user understands. */
export function friendlyAuthError(error, fallback = 'Something went wrong. Please try again.') {
  const messages = {
    'auth/email-already-in-use': 'An account with this email already exists — sign in instead.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/weak-password': 'Choose a stronger password (at least 8 characters with a letter and a number).',
    'auth/operation-not-allowed': 'Email sign-up is switched off in Firebase. Enable Email/Password under Authentication → Sign-in method.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account found for this email — create one first.',
    'auth/user-disabled': 'This account has been disabled. Contact the placement cell.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'No internet connection. Check your network and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  }
  if (error?.code && messages[error.code]) return messages[error.code]
  return String(error?.message || fallback).replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '') || fallback
}
