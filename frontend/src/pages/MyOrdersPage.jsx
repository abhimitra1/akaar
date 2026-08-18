import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AppNav from '../components/AppNav.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import CommissionStatusBadge from '../components/CommissionStatusBadge.jsx'
import '../pages/Home.css'
import '../pages/Library.css'
import './Commission.css'

// My Commissions: every "make this design into a physical piece" request the signed-in
// user has submitted, newest first — same list shape as LibraryPage, but scoped to
// commissions rather than crafts. Detail/decision UI lives at /commissions/:commissionId
// (CommissionDetailPage).
export default function MyCommissionsPage() {
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
      const { data: commissions, error: dbError } = await supabase
        .from('commissions')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (dbError) {
        setError(dbError.message)
        setLoading(false)
        return
      }
      setRows(commissions || [])

      const craftIds = [...new Set((commissions || []).map((c) => c.craft_id))]
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

  return (
    <div className="home">
      <AppNav active="commissions" />

      <section className="home__content">
        <h1 className="home__title">My Commissions</h1>

        {loading ? (
          <LoadingScreen message="Loading your commissions..." inline />
        ) : (
          <>
            {error && <p className="explore__error">{error}</p>}

            {rows.length === 0 ? (
              <div className="home__empty-state">
                <p className="home__empty-title">No production requests yet.</p>
                <p className="home__empty-sub">
                  Open a finished design and choose "Submit for Production" to have it made.
                </p>
              </div>
            ) : (
              <div className="home__recent-list">
                {rows.map((row) => {
                  const craft = craftsById[row.craft_id]
                  const thumb = craft?.photos?.[0]
                  return (
                    <article key={row.id} className="home__recent-row" onClick={() => navigate(`/commissions/${row.id}`)}>
                      <div className="home__recent-thumbnail-wrapper">
                        {thumb ? (
                          <img src={thumb} alt={craft?.title || 'Untitled'} className="home__recent-thumbnail" loading="lazy" />
                        ) : (
                          <div className="home__recent-placeholder" />
                        )}
                      </div>
                      <div className="home__recent-body">
                        <h3 className="home__recent-title">{craft?.title || 'Untitled'}</h3>
                        <p className="home__recent-subtitle">Submitted {new Date(row.created_at).toLocaleDateString()}</p>
                      </div>
                      <CommissionStatusBadge status={row.status} />
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
