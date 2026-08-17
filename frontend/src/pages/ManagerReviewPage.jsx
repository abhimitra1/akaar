import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import CommissionStatusBadge from '../components/CommissionStatusBadge.jsx'
import FeasibilityChecklist from '../components/FeasibilityChecklist.jsx'
import { emptyConstraintFlags } from '../data/feasibilityChecklist.js'
import '../pages/Create.css'
import '../pages/CraftPage.css'
import '../pages/Library.css'
import './Commission.css'

// One commission's manufacturing-feasibility review — the actual decision screen behind
// ManagerPage's queue. Shows exactly what the customer sees (same 3D twin + metadata) so
// a manager never has to take the design's feasibility on faith from a thumbnail.
export default function ManagerReviewPage() {
  const { commissionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [commission, setCommission] = useState(null)
  const [craft, setCraft] = useState(null)
  const [modelUrl, setModelUrl] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [checklist, setChecklist] = useState(emptyConstraintFlags())
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(null) // null | 'changes_requested' | 'approved' | 'rejected'
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: row, error: dbError } = await supabase
        .from('commissions')
        .select('*')
        .eq('id', commissionId)
        .single()
      if (cancelled) return
      if (dbError) {
        setLoadError('Commission not found')
        setLoading(false)
        return
      }
      setCommission(row)

      const { data: craftRow } = await supabase.from('crafts').select('*').eq('id', row.craft_id).single()
      if (!cancelled && craftRow) {
        setCraft(craftRow)
        if (craftRow.model_key) {
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(craftRow.model_key)
          setModelUrl(pub.publicUrl)
        }
      }

      const { data: profile } = await supabase
        .from('public_profiles')
        .select('full_name')
        .eq('id', row.customer_id)
        .single()
      if (!cancelled) setCustomerName(profile?.full_name || '')

      const { data: reviews } = await supabase
        .from('commission_reviews')
        .select('*')
        .eq('commission_id', commissionId)
        .order('created_at', { ascending: false })
      if (!cancelled) setHistory(reviews || [])

      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [commissionId])

  const handleChecklistChange = (key, entry) => {
    setChecklist((c) => ({ ...c, [key]: entry }))
  }

  const handleDecide = async (decision) => {
    if (decision !== 'approved' && remarks.trim() === '') {
      setActionError('Add a remark explaining what needs to change before sending this back.')
      return
    }
    setActionError('')
    setSubmitting(decision)
    try {
      // Review row first — commission_reviews_insert's RLS requires the commission to
      // still be pending_manager_review at insert time, so this has to land before the
      // status update below moves it out of that state.
      const { error: reviewError } = await supabase.from('commission_reviews').insert({
        commission_id: commission.id,
        reviewer_id: user.id,
        decision,
        remarks: remarks.trim() || null,
        constraint_flags: checklist,
      })
      if (reviewError) throw new Error(reviewError.message)

      const nextStatus =
        decision === 'approved' ? 'pending_customer_approval' : decision === 'rejected' ? 'rejected' : 'changes_requested'
      const { error: updateError } = await supabase.from('commissions').update({ status: nextStatus }).eq('id', commission.id)
      if (updateError) throw new Error(updateError.message)

      navigate('/manager')
    } catch (err) {
      setActionError(err.message || 'Something went wrong')
      setSubmitting(null)
    }
  }

  // Hands this craft to /create as a co-creation source, same as CraftPage's own
  // "Co-Create with AI" button — but tagged with reworkCommissionId/reworkReturnTo so
  // MetadataPage's Store/Save step re-points this commission at the fresh result and
  // sends the manager back here instead of to a plain new craft page. See CreatePage.jsx,
  // ProcessingPage.jsx and MetadataPage.jsx for how that tag is carried through.
  const handleReworkHere = () => {
    navigate('/create', {
      state: { cocreateSource: craft, reworkCommissionId: commission.id, reworkReturnTo: 'manager' },
    })
  }

  if (loading) return <LoadingScreen message="Loading review..." />

  if (loadError || !commission || !craft) {
    return (
      <div className="craft">
        <div className="craft__card">
          <p className="craft__error">{loadError || 'Commission not found'}</p>
          <button type="button" className="craft__btn craft__btn--primary" onClick={() => navigate('/manager')}>
            Back to queue
          </button>
        </div>
      </div>
    )
  }

  const isDecidable = commission.status === 'pending_manager_review'

  const metaRows = [
    ['Craft type', craft.craft_type],
    ['Material', craft.material],
    ['Technique', craft.technique],
    ['Dimensions', craft.dimensions],
    ['Height', craft.height_cm != null ? `${craft.height_cm} cm` : null],
    ['Weight', craft.weight != null ? `${craft.weight} kg` : null],
  ].filter(([, v]) => v != null && v !== '')

  return (
    <div className="craft">
      <header className="craft__header">
        <button type="button" className="craft__back" aria-label="Back" onClick={() => navigate('/manager')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="craft__title">{craft.title || 'Untitled'}</h1>
      </header>

      <div className="craft__content">
        <div className="craft__media">
          {modelUrl ? (
            <model-viewer
              className="craft__viewer"
              src={modelUrl}
              alt={craft.title}
              camera-controls
              auto-rotate
              style={{ width: '100%', height: '360px' }}
            />
          ) : craft.photos?.[0] ? (
            <img src={craft.photos[0]} alt={craft.title} className="craft__photo" />
          ) : (
            <div className="craft__no-model">No 3D model yet.</div>
          )}
        </div>

        <div className="craft__card">
          <div className="commission__row">
            <p className="craft__creator">Requested by {customerName || 'Unknown customer'}</p>
            <CommissionStatusBadge status={commission.status} />
          </div>

          <dl className="craft__meta">
            {metaRows.map(([label, value]) => (
              <div className="craft__meta-row" key={label}>
                <dt className="craft__meta-label">{label}</dt>
                <dd className="craft__meta-value">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {isDecidable ? (
          <div className="craft__card">
            <h2 className="commission__section-title">Manufacturing feasibility</h2>
            <FeasibilityChecklist value={checklist} onChange={handleChecklistChange} />

            <label className="field">
              <span className="field__label">Remarks for the customer</span>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder="What's possible, what isn't, and what to change — this is what the customer sees if you request changes."
              />
            </label>

            {actionError && (
              <div className="create__error" role="alert">
                {actionError}
              </div>
            )}

            <div className="commission__actions">
              <button
                type="button"
                className="craft__btn craft__btn--primary"
                disabled={submitting !== null}
                onClick={() => handleDecide('approved')}
              >
                {submitting === 'approved' ? 'Approving…' : 'Approve — send to customer'}
              </button>
              <button
                type="button"
                className="craft__btn craft__btn--ghost"
                disabled={submitting !== null}
                onClick={() => handleDecide('changes_requested')}
              >
                {submitting === 'changes_requested' ? 'Sending…' : 'Request changes'}
              </button>
              <button type="button" className="craft__btn craft__btn--ai" disabled={submitting !== null} onClick={handleReworkHere}>
                Rework it here
              </button>
              <button
                type="button"
                className="commission__link-danger"
                disabled={submitting !== null}
                onClick={() => handleDecide('rejected')}
              >
                {submitting === 'rejected' ? 'Declining…' : 'Decline this commission'}
              </button>
            </div>
          </div>
        ) : (
          <div className="craft__card">
            <p className="commission__note">
              This commission already moved past review — no further action here. Its full history is below.
            </p>
          </div>
        )}

        {history.length > 0 && (
          <div className="craft__card">
            <h2 className="commission__section-title">Review history</h2>
            <div className="commission__history">
              {history.map((review) => (
                <div key={review.id} className="commission__history-item">
                  <div className="commission__row">
                    <span className={`commission__pill commission__pill--${review.decision === 'approved' ? 'ok' : review.decision === 'rejected' ? 'not_feasible' : 'na'}`}>
                      {review.decision === 'approved' ? 'Approved' : review.decision === 'rejected' ? 'Declined' : 'Changes requested'}
                    </span>
                    <span className="commission__history-date">{new Date(review.created_at).toLocaleString()}</span>
                  </div>
                  {review.remarks && <p className="commission__checklist-note">{review.remarks}</p>}
                  <FeasibilityChecklist value={review.constraint_flags} readOnly />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
