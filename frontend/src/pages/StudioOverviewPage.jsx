import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { roleLabel, isStudioManagerOrAbove, isDesigner, manageableRoles } from '../roles.js'
import './Studio.css'

// /studio's index route — a role-appropriate landing page instead of redirecting each
// role to a different "home" section. Every studio role sees a sensible dashboard here
// regardless of which sections they individually have access to (StudioLayout's sidebar
// already hides the ones they don't).
export default function StudioOverviewPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [pendingOrders, setPendingOrders] = useState(null)
  const [assignedToMe, setAssignedToMe] = useState(null)
  const [teamCount, setTeamCount] = useState(null)

  const canReview = isStudioManagerOrAbove(user)
  const isDesignerUser = isDesigner(user)
  const managed = manageableRoles(user)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (canReview) {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_manager_review')
        if (!cancelled) setPendingOrders(count ?? 0)

        if (managed.length > 0) {
          const { count: team } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .in('role', managed)
          if (!cancelled) setTeamCount(team ?? 0)
        }
      }
      if (isDesignerUser && user) {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_designer_id', user.id)
          .eq('status', 'changes_requested')
        if (!cancelled) setAssignedToMe(count ?? 0)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return (
    <div>
      <h1 className="studio-page__title">Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}</h1>
      <p className="studio-page__subtitle">Signed in as {roleLabel(user)}.</p>

      <div className="studio-stats">
        {canReview && (
          <button type="button" className="studio-stat" onClick={() => navigate('/studio/orders')}>
            <span className="studio-stat__value">{pendingOrders ?? '—'}</span>
            <span className="studio-stat__label">Orders awaiting review</span>
          </button>
        )}
        {isDesignerUser && (
          <button type="button" className="studio-stat" onClick={() => navigate('/studio/designer-queue')}>
            <span className="studio-stat__value">{assignedToMe ?? '—'}</span>
            <span className="studio-stat__label">Assigned to you</span>
          </button>
        )}
        {canReview && (
          <button type="button" className="studio-stat" onClick={() => navigate('/studio/team')}>
            <span className="studio-stat__value">{teamCount ?? '—'}</span>
            <span className="studio-stat__label">People on your team</span>
          </button>
        )}
      </div>

      {!canReview && !isDesignerUser && (
        <div className="studio-empty">Nothing assigned to your role yet.</div>
      )}
    </div>
  )
}
