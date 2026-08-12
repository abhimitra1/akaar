import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Wraps every route (not just ProtectedRoute ones — Home/Explore are guest-accessible
// too) to catch authenticated users who haven't accepted the current Terms yet, without
// affecting actual guests (unauthenticated, so isAuthenticated is false here).
// profiles.terms_accepted_at is null until accepted — checked here, forces a stop at
// /accept-terms. Applies to every signed-in user, not just new ones: this column defaults
// to null on every existing row too, so it retroactively requires acceptance from everyone
// the first time they land here after this shipped — same as a real ToS update would.
export default function ProfileGate({ children }) {
  const { isAuthenticated, loading, profileLoading, user } = useAuth()
  const location = useLocation()

  // profileLoading matters as much as loading here: onAuthStateChange re-fires (token
  // refresh, sign-in) without going through the initial `loading` flow, and while a re-fetch
  // is in flight `user` can be AuthContext's {id, email}-only fallback — which has no
  // `terms_accepted_at` at all. Deciding off that partial shape is exactly what caused
  // already-accepted users to flash through /accept-terms and get stuck there (nothing
  // re-checks once already on that route) — wait for a real profile before deciding either way.
  const ready = !loading && !profileLoading

  const needsTerms =
    ready && isAuthenticated && !user?.terms_accepted_at && location.pathname !== '/accept-terms'

  if (needsTerms) return <Navigate to="/accept-terms" replace />
  return children
}
