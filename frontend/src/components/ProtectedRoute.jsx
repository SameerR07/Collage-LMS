import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess, homeFor } from '../lib/roles'

/** Signed-in only, and only pages the person's role may open (others go to their own home). */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="app-loading"><div className="loading-orbit" /><p>Loading your Placement LMS…</p></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!canAccess(user.role, location.pathname)) {
    const home = homeFor(user.role)
    return <Navigate to={canAccess(user.role, home) ? home : '/login'} replace />
  }
  return children
}
