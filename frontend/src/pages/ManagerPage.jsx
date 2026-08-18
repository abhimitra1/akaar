import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import LoadingScreen from '../components/LoadingScreen.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'
import '../pages/Home.css'
import '../pages/Library.css'
import '../pages/Studio.css'
import './Order.css'

// Studio order review queue (studio_manager/studio_admin) — every order currently
// awaiting a manufacturing-feasibility decision, oldest first (first submitted, first
// reviewed). Rendered inside StudioLayout's <Outlet/> at /studio/orders — deliberately
// just the queue, decision UI lives at /studio/orders/:orderId (ManagerReviewPage), same
// list/detail split LibraryPage uses with CraftPage.
export default function ManagerPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [craftsById, setCraftsById] = useState({})
  const [namesById, setNamesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: orders, error: dbError } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'pending_manager_review')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (dbError) {
        setError(dbError.message)
        setLoading(false)
        return
      }
      setRows(orders || [])

      const craftIds = [...new Set((orders || []).map((o) => o.craft_id))]
      const customerIds = [...new Set((orders || []).map((o) => o.customer_id))]

      if (craftIds.length > 0) {
        const { data: crafts } = await supabase.from('crafts').select('*').in('id', craftIds)
        if (!cancelled && crafts) setCraftsById(Object.fromEntries(crafts.map((c) => [c.id, c])))
      }
      if (customerIds.length > 0) {
        const { data: profiles } = await supabase.from('public_profiles').select('id, full_name').in('id', customerIds)
        if (!cancelled && profiles) setNamesById(Object.fromEntries(profiles.map((p) => [p.id, p.full_name])))
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <LoadingScreen message="Loading review queue..." inline />

  return (
    <div>
      <h1 className="studio-page__title">Orders</h1>
      <p className="studio-page__subtitle">Manufacturing-feasibility review queue, oldest first.</p>

      {error && <p className="explore__error">{error}</p>}

      {rows.length === 0 ? (
        <div className="studio-empty">Queue is empty — nothing is waiting on review right now.</div>
      ) : (
        <div className="home__recent-list">
          {rows.map((row) => {
            const craft = craftsById[row.craft_id]
            const thumb = craft?.photos?.[0]
            return (
              <article key={row.id} className="home__recent-row" onClick={() => navigate(`/studio/orders/${row.id}`)}>
                <div className="home__recent-thumbnail-wrapper">
                  {thumb ? (
                    <img src={thumb} alt={craft?.title || 'Untitled'} className="home__recent-thumbnail" loading="lazy" />
                  ) : (
                    <div className="home__recent-placeholder" />
                  )}
                </div>
                <div className="home__recent-body">
                  <h3 className="home__recent-title">{craft?.title || 'Untitled'}</h3>
                  <p className="home__recent-subtitle">
                    {namesById[row.customer_id] || 'Unknown customer'} · Submitted{' '}
                    {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
                <OrderStatusBadge status={row.status} />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
