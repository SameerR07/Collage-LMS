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

export const statusClass = (status = '') => status.toLowerCase().replace(/\s+/g, '-')

export const flattenForExport = (rows) =>
  rows.map((row) => {
    const copy = { ...row }
    delete copy.id
    delete copy.createdAt
    return copy
  })
