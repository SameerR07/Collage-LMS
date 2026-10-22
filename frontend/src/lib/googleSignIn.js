/* =========================================================
   "Continue with Google" in the browser (Google Identity Services).
   The client ID comes from the LMS server (GOOGLE_CLIENT_ID in
   env/backend.env), so it is set up in one place. Google's answer (an ID
   token) is checked by the server before an account is opened.
========================================================= */
const GSI_SRC = 'https://accounts.google.com/gsi/client'
let configPromise = null
let scriptPromise = null

/** { enabled, clientId } — enabled is false when the server has no GOOGLE_CLIENT_ID (or isn't running). */
export function getGoogleConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/auth/google/config')
      .then((response) => (response.ok ? response.json() : { enabled: false, clientId: '' }))
      .catch(() => ({ enabled: false, clientId: '' }))
  }
  return configPromise
}

/** Loads Google's sign-in script once. */
export function loadGoogleScript() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      script.onload = () => (globalThis.google?.accounts?.id ? resolve(globalThis.google) : reject(new Error('Google sign-in did not load.')))
      script.onerror = () => { scriptPromise = null; reject(new Error('Google sign-in could not load. Check the internet connection.')) }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/**
 * Draws Google's official button inside `element`.
 * onCredential(idToken) runs after the person picks their Google account.
 */
export async function renderGoogleButton(element, { clientId, onCredential, text = 'continue_with', dark = false }) {
  const google = await loadGoogleScript()
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => { if (response?.credential) onCredential(response.credential) },
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
    context: 'signin',
  })
  element.innerHTML = ''
  const width = Math.max(220, Math.min(400, Math.round(element.getBoundingClientRect().width || 320)))
  google.accounts.id.renderButton(element, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text, shape: 'pill', logo_alignment: 'center', width })
}

/** Server check of Google's answer → { email, name, picture }. Throws with a plain message. */
export async function verifyGoogleCredential(credential) {
  let response
  try {
    response = await fetch('/api/auth/google/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) })
  } catch {
    throw new Error('The LMS server could not be reached. Please try again.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw new Error(data.error || 'Google sign-in failed. Please try again.')
  return data
}
