import { Navigate } from 'react-router-dom'
import LoadingScreen from './LoadingScreen.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { hasStudioAccess } from '../roles.js'

// Gates the whole /studio panel — any role with at least one section to see there
// (studio_manager, studio_admin, designer, or a super admin). Individual sections are
// further gated by their own guard (ManagerRoute/TeamRoute/DesignerRoute/AdminRoute) for
// defense in depth, same layered pattern as every other route guard in this app; RLS is
// still the actual boundary underneath both.
export default function StudioRoute({ children }) {
  const { isAuthenticated, loading, profileLoading, user } = useAuth()
  if (loading || profileLoading) return <LoadingScreen message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/welcome" replace />
  if (!hasStudioAccess(user)) return <Navigate to="/" replace />
  return children
}
