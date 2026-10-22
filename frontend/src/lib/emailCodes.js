/* Emailed 6-digit codes (student sign-up, password reset) — see /api/mail/code/* in backend/mailApi.mjs.
   The browser only keeps a signed token; the code itself is only in the email. */
const headers = () => {
  const token = import.meta.env?.VITE_MAIL_API_TOKEN
  return { 'Content-Type': 'application/json', ...(token ? { 'X-Mail-Token': token } : {}) }
}

async function post(path, body) {
  let response
  try {
    response = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  } catch {
    throw new Error('The email service could not be reached. Please try again.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

/** Emails a code; returns { token, minutes }. purpose: 'signup' | 'reset'. */
export const requestCode = (email, name, purpose = 'signup') => post('/api/mail/code/send', { email, name, purpose })

/** Throws with a clear message when the code is wrong or expired. */
export const confirmCode = (email, code, token, purpose = 'signup') => post('/api/mail/code/check', { email, code, token, purpose })
