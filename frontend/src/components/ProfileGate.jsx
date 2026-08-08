import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Wraps every route (not just ProtectedRoute ones — Home/Explore are guest-accessible
// too) to catch two kinds of "not fully onboarded yet" authenticated users, without
// affecting actual guests (unauthenticated, so isAuthenticated is false here):
//   1. Terms not yet accepted (profiles.terms_accepted_at is null) — checked first, forces
//      a stop at /accept-terms. Applies to every signed-in user, not just new ones: this
//      column defaults to null on every existing row too, so it retroactively requires
//      acceptance from everyone the first time they land here after this shipped — same as
//      a real ToS update would.
//   2. Google OAuth first-timers: their profile row exists but role is still the 'visitor'
//      default (Google doesn't collect role/institution/department the way email signup
//      does). Forces a stop at /complete-profile.
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
  const needsProfile =
    ready && isAuthenticated && user?.role === 'visitor' && location.pathname !== '/complete-profile'

  if (needsTerms) return <Navigate to="/accept-terms" replace />
  if (needsProfile) return <Navigate to="/complete-profile" replace />
  return children
}
