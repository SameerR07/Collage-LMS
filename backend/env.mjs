/* Reading env/backend.env — shared by the mail API and Google sign-in. */
import { existsSync, readFileSync, statSync } from 'node:fs'

/** Minimal .env reader: KEY=value lines, # comments, optional quotes. */
export function parseEnv(text) {
  const values = {}
  String(text).split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) return
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '')
    values[match[1]] = value
  })
  return values
}

/** Values from the file (re-read when it changes), falling back to process environment variables. */
export function envReader(envFile, env = process.env) {
  let cache = { mtime: -1, values: {} }
  return (key, fallback = '') => {
    if (envFile && existsSync(envFile)) {
      const mtime = statSync(envFile).mtimeMs
      if (mtime !== cache.mtime) cache = { mtime, values: parseEnv(readFileSync(envFile, 'utf8')) }
    } else cache = { mtime: 0, values: {} }
    return String(cache.values[key] ?? env[key] ?? fallback).trim()
  }
}
