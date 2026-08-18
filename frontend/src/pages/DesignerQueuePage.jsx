import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'
import './CraftPage.css'
import './Studio.css'

// Orders a studio manager has routed to this designer for rework (orders.
// assigned_designer_id = auth.uid(), status = 'changes_requested' — see
// supabase/migrations/012_designer_assignment.sql). Same list/detail split as
// ManagerPage/OrderDetailPage: this page is the queue, reworking happens by handing the
// craft to the existing Co-Create flow (same reworkOrderId/reworkReturnTo threading
// already built for the customer's own rework path), not a bespoke editor here.
export default function DesignerQueuePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [craftsById, setCraftsById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      const { data: orders, error: dbError } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_designer_id', user.id)
        .eq('status', 'changes_requested')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (dbError) {
        setError(dbError.message)
        setLoading(false)
        return
      }
      setRows(orders || [])

      const craftIds = [...new Set((orders || []).map((o) => o.craft_id))]
      if (craftIds.length > 0) {
        const { data: crafts } = await supabase.from('crafts').select('*').in('id', craftIds)
        if (!cancelled && crafts) setCraftsById(Object.fromEntries(crafts.map((c) => [c.id, c])))
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleRework = (order) => {
    const craft = craftsById[order.craft_id]
    if (!craft) return
    navigate('/create', {
      state: { cocreateSource: craft, reworkOrderId: order.id, reworkReturnTo: 'designer-queue' },
    })
  }

  if (loading) return <LoadingScreen message="Loading your assignments..." inline />

  return (
    <div>
      <h1 className="studio-page__title">My Assignments</h1>
      <p className="studio-page__subtitle">Orders a studio manager has routed to you for rework.</p>

      {error && (
        <div className="create__error studio-page__error" role="alert">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="studio-empty">Nothing assigned to you right now.</div>
      ) : (
        <div className="studio-list">
          {rows.map((order) => {
            const craft = craftsById[order.craft_id]
            return (
              <div className="studio-row" key={order.id}>
                <div className="studio-row__avatar">
                  {craft?.photos?.[0] ? <img src={craft.photos[0]} alt="" className="studio-row__thumb" /> : '?'}
                </div>
                <div className="studio-row__body">
                  <span className="studio-row__name">{craft?.title || 'Untitled'}</span>
                  <span className="studio-row__meta">Assigned {new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <OrderStatusBadge status={order.status} />
                <button type="button" className="craft__btn craft__btn--ai studio-row__action" onClick={() => handleRework(order)}>
                  Rework
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
