import { Navigate } from 'react-router-dom'
import LoadingScreen from './LoadingScreen.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { isStudioManagerOrAbove } from '../roles.js'

// Gates /studio/team — studio_manager, studio_admin, or a super admin standing in.
export default function TeamRoute({ children }) {
  const { isAuthenticated, loading, profileLoading, user } = useAuth()
  if (loading || profileLoading) return <LoadingScreen message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/welcome" replace />
  if (!isStudioManagerOrAbove(user)) return <Navigate to="/studio" replace />
  return children
}
