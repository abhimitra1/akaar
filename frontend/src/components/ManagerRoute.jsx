import { Navigate } from 'react-router-dom'
import LoadingScreen from './LoadingScreen.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// Gates /manager on profiles.is_manager (granted via supabase/migrations/
// 009_manager_commissions.sql), not just being signed in — mirrors AdminRoute.jsx
// exactly. Super admins pass too, same "full access flag beats every narrower one"
// convention as the rest of the app, so a super admin can review the queue without also
// needing is_manager set on their own row.
export default function ManagerRoute({ children }) {
  const { isAuthenticated, loading, profileLoading, user } = useAuth()
  if (loading || profileLoading) return <LoadingScreen message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/welcome" replace />
  if (!user?.is_manager && !user?.is_super_admin) return <Navigate to="/" replace />
  return children
}
