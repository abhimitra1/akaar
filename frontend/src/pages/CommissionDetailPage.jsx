import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import CommissionStatusBadge from '../components/CommissionStatusBadge.jsx'
import FeasibilityChecklist from '../components/FeasibilityChecklist.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import '../pages/Create.css'
import '../pages/CraftPage.css'
import '../pages/Library.css'
import './Commission.css'

// One commission's status, from the customer's side — mirrors ManagerReviewPage's layout
// (same 3D twin + metadata) but swaps the manager's decision panel for whatever action
// the customer can currently take: rework a design a manager sent back, ratify one a
// manager approved, or just watch a still-queued one.
export default function CommissionDetailPage() {
  const { commissionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [commission, setCommission] = useState(null)
  const [craft, setCraft] = useState(null)
  const [modelUrl, setModelUrl] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => {
    if (!user) return
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
  }, [commissionId, user])

  const latestReview = history[0] || null

  const handleReworkInCoCreate = () => {
    navigate('/create', {
      state: { cocreateSource: craft, reworkCommissionId: commission.id, reworkReturnTo: 'commissions' },
    })
  }

  const handleRatify = async () => {
    setSubmitting(true)
    setActionError('')
    try {
      const { error } = await supabase.from('commissions').update({ status: 'ratified' }).eq('id', commission.id)
      if (error) throw new Error(error.message)
      setCommission((c) => ({ ...c, status: 'ratified' }))
    } catch (err) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    setConfirmingCancel(false)
    setSubmitting(true)
    setActionError('')
    try {
      const { error } = await supabase.from('commissions').update({ status: 'cancelled' }).eq('id', commission.id)
      if (error) throw new Error(error.message)
      setCommission((c) => ({ ...c, status: 'cancelled' }))
    } catch (err) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingScreen message="Loading commission..." />

  if (loadError || !commission || !craft) {
    return (
      <div className="craft">
        <div className="craft__card">
          <p className="craft__error">{loadError || 'Commission not found'}</p>
          <button type="button" className="craft__btn craft__btn--primary" onClick={() => navigate('/commissions')}>
            Back to My Commissions
          </button>
        </div>
      </div>
    )
  }

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
        <button type="button" className="craft__back" aria-label="Back" onClick={() => navigate('/commissions')}>
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
            <p className="craft__creator">Production request</p>
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

        {actionError && (
          <div className="create__error" role="alert">
            {actionError}
          </div>
        )}

        {commission.status === 'changes_requested' && (
          <div className="craft__card">
            <h2 className="commission__section-title">What a manager found</h2>
            {latestReview?.remarks && <p className="commission__checklist-note">{latestReview.remarks}</p>}
            {latestReview?.constraint_flags && <FeasibilityChecklist value={latestReview.constraint_flags} readOnly />}
            <div className="commission__actions">
              <button type="button" className="craft__btn craft__btn--ai" disabled={submitting} onClick={handleReworkInCoCreate}>
                Rework in Co-Create
              </button>
            </div>
          </div>
        )}

        {commission.status === 'pending_manager_review' && (
          <div className="craft__card">
            <p className="commission__note">Waiting on a manufacturing-feasibility review from a manager.</p>
            <div className="commission__actions">
              <button type="button" className="commission__link-danger" disabled={submitting} onClick={() => setConfirmingCancel(true)}>
                Withdraw request
              </button>
            </div>
          </div>
        )}

        {commission.status === 'pending_customer_approval' && (
          <div className="craft__card">
            <p className="commission__note">
              A manager confirmed this design is feasible to produce. Confirm to move forward.
            </p>
            <div className="commission__actions">
              <button type="button" className="craft__btn craft__btn--primary" disabled={submitting} onClick={handleRatify}>
                {submitting ? 'Confirming…' : 'Confirm & Ratify'}
              </button>
              <button type="button" className="commission__link-danger" disabled={submitting} onClick={() => setConfirmingCancel(true)}>
                Cancel request
              </button>
            </div>
          </div>
        )}

        {commission.status === 'ratified' && (
          <div className="craft__card">
            <p className="commission__note">
              Ratified — this design is committed for production. Artisan assignment and fulfillment tracking are coming soon.
            </p>
          </div>
        )}

        {(commission.status === 'rejected' || commission.status === 'cancelled') && (
          <div className="craft__card">
            <p className="commission__note">
              {commission.status === 'rejected'
                ? 'This request was declined.'
                : 'This request was cancelled.'}
              {latestReview?.remarks && ` ${latestReview.remarks}`}
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
                    <span
                      className={`commission__pill commission__pill--${
                        review.decision === 'approved' ? 'ok' : review.decision === 'rejected' ? 'not_feasible' : 'na'
                      }`}
                    >
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

      <ConfirmDialog
        open={confirmingCancel}
        title="Withdraw this request?"
        message="This can't be undone — you'd need to submit a fresh request to try again."
        confirmLabel="Withdraw"
        danger
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  )
}
