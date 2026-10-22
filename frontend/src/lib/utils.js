export const firstName = (user) => {
  const value = user?.displayName || user?.email?.split('@')[0] || 'there'
  return value.split(/\s+/)[0]
}

export const todayLabel = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).format(new Date())

export const formatDate = (value) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

export const statusClass = (status = '') => String(status || '').toLowerCase().replace(/\s+/g, '-')

/* ---------- Presentation helpers (redesign) ---------- */

// Friendly name for greetings: built-in accounts by their full name ("Placement Cell"), people by first name.
export const greetingName = (user) => {
  if (user?.builtIn || user?.providerId === 'demo') return user?.displayName || 'Placement Cell'
  return firstName(user)
}

export const timeGreeting = (date = new Date()) => {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export const initials = (value = '') => {
  const words = String(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '—'
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase()
}

// Stable tint for an avatar, so the same name always gets the same colour.
const AVATAR_TONES = ['ink', 'ember', 'gold', 'sage']
export const avatarTone = (value = '') => {
  let hash = 0
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

export const dateParts = (value) => {
  const parsed = new Date(value)
  if (!value || Number.isNaN(parsed.getTime())) return { day: '—', month: '' }
  return {
    day: new Intl.DateTimeFormat('en-IN', { day: '2-digit' }).format(parsed),
    month: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(parsed),
  }
}

export const flattenForExport = (rows) =>
  rows.map((row) => {
    const copy = { ...row }
    delete copy.id
    delete copy.createdAt
    return copy
  })

// "Learn. Prepare. Get placed." — the last word of a title gets the italic ember→gold accent.
export const splitTitle = (title = '') => {
  const words = String(title).trim().split(/\s+/)
  if (words.length < 2) return ['', words[0] || '']
  return [words.slice(0, -1).join(' '), words[words.length - 1]]
}

/* ---------- Account details for the profile menu ---------- */
const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** "Today, 3:42 pm" / "Yesterday, 9:10 am" / "02 Oct 2026, 3:42 pm" */
export const friendlyDateTime = (value, now = new Date()) => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86400000)
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : dayFormat.format(date)
  return `${day}, ${timeFormat.format(date)}`
}

const ROLE_CHIP = { admin: 'Admin', placement: 'Placement Cell', student: 'Student' }

/** Plain-language facts about the signed-in account (built-in, browser, Google or email/password). */
export const accountDetails = (user, { cloud = false } = {}) => {
  const isDemo = user?.providerId === 'demo'
  const isLocal = user?.providerId === 'local' || user?.providerId === 'builtin' // accounts kept in this browser (no Firebase)
  const providers = (user?.providerData || []).map((provider) => provider?.providerId)
  const method = isDemo ? 'Demo account' : isLocal || providers.includes('password') ? 'Email & password' : providers.includes('google.com') ? 'Google' : 'College account'
  return {
    fullName: user?.displayName || (user?.email ? user.email.split('@')[0] : 'Placement Cell user'),
    email: user?.email || '',
    photo: user?.photoURL || '',
    method,
    isDemo,
    isLocal,
    chip: ROLE_CHIP[user?.role] ? `${ROLE_CHIP[user.role]}${user?.builtIn ? ' · Built-in' : ''}` : isDemo ? 'Demo account' : isLocal ? 'Local account' : 'Placement Cell',
    role: user?.role || null,
    signedIn: friendlyDateTime(isDemo || isLocal ? user?.signedInAt : user?.metadata?.lastSignInTime) || 'This session',
    verified: isDemo || isLocal ? null : Boolean(user?.emailVerified),
    storage: cloud && !isDemo && !isLocal ? 'College cloud (Firebase)' : 'This browser only',
  }
}
