import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Wraps every route (not just ProtectedRoute ones — Home/Explore are guest-accessible
// too) to catch Google OAuth first-timers: their profile row exists but role is still
// the 'visitor' default (Google doesn't collect role/institution/department the way
// email signup does). Forces a stop at /complete-profile before anything else, without
// affecting actual guests — they're unauthenticated, so isAuthenticated is false here.
export default function ProfileGate({ children }) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  const needsProfile =
    !loading && isAuthenticated && user?.role === 'visitor' && location.pathname !== '/complete-profile'

  if (needsProfile) return <Navigate to="/complete-profile" replace />
  return children
}
