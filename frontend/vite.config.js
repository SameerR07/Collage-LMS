import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/* Folders
     frontend/   this app (React)          backend/   email + "Continue with Google" checks
     env/        settings: backend.env (email password, Google Client ID), frontend.env (Firebase, optional)
   Emails (/api/mail/*) and Google checks (/api/auth/google/*) run inside the dev and preview servers,
   so `npm run dev` (from the project folder) is all that's needed. */
const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const ENV_DIR = here('../env')
const BACKEND_ENV = here('../env/backend.env')

// Firebase settings (VITE_… lines) for the app come from env/frontend.env, if it exists.
const FRONTEND_ENV = here('../env/frontend.env')
if (existsSync(FRONTEND_ENV)) {
  for (const line of readFileSync(FRONTEND_ENV, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]] !== undefined) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

function backendApi() {
  let api
  const mount = async (server) => {
    if (existsSync(here('../server/.env'))) {
      server.config.logger.warn('\n  Found server/.env — the settings now live in env/backend.env. Copy any changes there.\n')
    }
    try {
      const { createGoogleAuth } = await import(/* @vite-ignore */ new URL('../backend/googleAuth.mjs', import.meta.url).href)
      const google = createGoogleAuth({ envFile: BACKEND_ENV })
      server.middlewares.use((req, res, next) => google.handle(req, res, next))
    } catch (error) {
      server.config.logger.warn(`\n  Google sign-in is off: ${error.message}\n`)
    }
    try {
      // Loaded at run time (not bundled into this config), so a missing package can't stop the dev server.
      const { createMailApi } = await import(/* @vite-ignore */ new URL('../backend/mailApi.mjs', import.meta.url).href)
      api = createMailApi({ envFile: BACKEND_ENV })
      server.middlewares.use((req, res, next) => api.handle(req, res, next))
    } catch (error) {
      // e.g. "npm install" not run yet after updating — the app still works, emails just wait in the queue
      server.config.logger.warn(`\n  Email service is off: ${error.message}\n  Run "npm install" once, then restart "npm run dev".\n`)
    }
  }
  return {
    name: 'gjimt-backend-api',
    configureServer: mount,
    configurePreviewServer: mount,
    buildEnd() { api?.close() },
  }
}

// Google's sign-in button needs the page address sent along when the LMS runs on http://localhost
const headers = { 'Referrer-Policy': 'no-referrer-when-downgrade' }

export default defineConfig({
  root: here('.'),
  envDir: ENV_DIR, // only VITE_… values ever reach the browser
  plugins: [react(), backendApi()],
  // VS Code port forwarding (https://….devtunnels.ms) — Vite refuses other addresses unless listed here
  server: { headers, allowedHosts: ['.devtunnels.ms'] },
  preview: { headers, allowedHosts: ['.devtunnels.ms'] },
  build: { outDir: here('../dist'), emptyOutDir: true },
})
