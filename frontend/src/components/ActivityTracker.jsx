import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { setCurrentPage, touchSession } from '../lib/activity'
import { IDLE_MINUTES, pageLabel } from '../lib/activityRules'

/**
 * Keeps the signed-in person's session record up to date: the page they are on and "last active"
 * (only while they are really using the LMS — a click or key press in the last few minutes, tab visible).
 */
export default function ActivityTracker() {
  const { user } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!user) return
    setCurrentPage(pageLabel(location.pathname))
    touchSession()
  }, [location.pathname, user])

  useEffect(() => {
    if (!user) return undefined
    let lastInput = Date.now()
    const onInput = () => { lastInput = Date.now() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach((name) => window.addEventListener(name, onInput, { passive: true }))
    const onVisible = () => { if (document.visibilityState === 'visible') { lastInput = Date.now(); touchSession() } }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MINUTES * 60 * 1000) touchSession()
    }, 60 * 1000)
    return () => {
      events.forEach((name) => window.removeEventListener(name, onInput))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [user])

  return null
}
