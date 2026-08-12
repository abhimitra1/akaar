import { Navigate } from 'react-router-dom'
import LoadingScreen from './LoadingScreen.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// Gates /admin on profiles.is_super_admin (granted via supabase/migrations/006_super_admin.sql),
// not just being signed in — ProtectedRoute alone isn't enough here. Sends non-admins to
// "/" rather than "/welcome" (they ARE authenticated, just not authorized) so it reads as
// "you can't go there", not "please sign in".
export default function AdminRoute({ children }) {
  const { isAuthenticated, loading, profileLoading, user } = useAuth()
  if (loading || profileLoading) return <LoadingScreen message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/welcome" replace />
  if (!user?.is_super_admin) return <Navigate to="/" replace />
  return children
}
