import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { DATA_CHANGED_EVENT, LOCAL_DATA_PREFIX, PUBLIC_STATS_PATH, cacheStats, localLoginStats, readCachedStats } from './dataStore'
import { cleanStats } from './statsCore'

/**
 * Live Quick Stats for the login page.
 * - Local mode: counted from the records saved in this browser, recounted
 *   whenever they change (this tab or another tab).
 * - Firebase: the published summary (public/loginStats), streamed live; falls
 *   back to the last numbers this device saw if the summary can't be read.
 */
export function useLoginStats() {
  const [stats, setStats] = useState(() => (isFirebaseConfigured ? cleanStats(readCachedStats()) : localLoginStats()))

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const recount = () => setStats(localLoginStats())
      const onStorage = (event) => { if (!event.key || event.key.startsWith(LOCAL_DATA_PREFIX)) recount() }
      window.addEventListener('storage', onStorage)
      window.addEventListener(DATA_CHANGED_EVENT, recount)
      return () => {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener(DATA_CHANGED_EVENT, recount)
      }
    }
    return onSnapshot(
      doc(db, ...PUBLIC_STATS_PATH),
      (snapshot) => {
        const next = cleanStats(snapshot.data())
        if (next) { setStats(next); cacheStats(next) }
      },
      (error) => console.info('[GJIMT LMS] Login stats summary not readable yet — publish firestore.rules. Showing last known numbers.', error?.code || error),
    )
  }, [])

  return stats
}
