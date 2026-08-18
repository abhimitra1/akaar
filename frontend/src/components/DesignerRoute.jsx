import { Navigate } from 'react-router-dom'
import LoadingScreen from './LoadingScreen.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { isDesigner } from '../roles.js'

// Gates /studio/designer-queue — the designer role, or a super admin standing in. Studio
// Managers/Admins don't get this section (they assign work here, they don't have their
// own personal assignment queue) — see StudioLayout.jsx's SECTIONS.
export default function DesignerRoute({ children }) {
  const { isAuthenticated, loading, profileLoading, user } = useAuth()
  if (loading || profileLoading) return <LoadingScreen message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/welcome" replace />
  if (!isDesigner(user)) return <Navigate to="/studio" replace />
  return children
}
