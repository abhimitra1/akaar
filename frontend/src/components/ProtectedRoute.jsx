import { Navigate } from 'react-router-dom'
import LoadingScreen from './LoadingScreen.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <LoadingScreen message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/welcome" replace />
  return children
}
