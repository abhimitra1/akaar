import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import LoadingScreen from '../components/LoadingScreen.jsx'
import CommissionStatusBadge from '../components/CommissionStatusBadge.jsx'
import '../pages/Home.css'
import '../pages/AdminPage.css'
import '../pages/Library.css'
import './Commission.css'

// Manager review queue (profiles.is_manager) — every commission currently awaiting a
// manufacturing-feasibility decision, oldest first (first submitted, first reviewed).
// Deliberately just the queue: the decision UI lives at /manager/:commissionId
// (ManagerReviewPage), the same list/detail split LibraryPage uses with CraftPage.
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
      const { data: commissions, error: dbError } = await supabase
        .from('commissions')
        .select('*')
        .eq('status', 'pending_manager_review')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (dbError) {
        setError(dbError.message)
        setLoading(false)
        return
      }
      setRows(commissions || [])

      const craftIds = [...new Set((commissions || []).map((c) => c.craft_id))]
      const customerIds = [...new Set((commissions || []).map((c) => c.customer_id))]

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

  if (loading) return <LoadingScreen message="Loading review queue..." />

  return (
    <div className="home">
      <header className="admin__header">
        <button type="button" className="admin__back" aria-label="Back" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="admin__title">Manager Review Queue</h1>
      </header>

      <section className="home__content commission__content">
        {error && <p className="explore__error">{error}</p>}

        {rows.length === 0 ? (
          <div className="home__empty-state">
            <p className="home__empty-title">Queue is empty.</p>
            <p className="home__empty-sub">Nothing is waiting on a feasibility review right now.</p>
          </div>
        ) : (
          <div className="home__recent-list">
            {rows.map((row) => {
              const craft = craftsById[row.craft_id]
              const thumb = craft?.photos?.[0]
              return (
                <article key={row.id} className="home__recent-row" onClick={() => navigate(`/manager/${row.id}`)}>
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
                  <CommissionStatusBadge status={row.status} />
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
