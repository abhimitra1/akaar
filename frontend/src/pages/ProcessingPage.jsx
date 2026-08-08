import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { clearRecoveryPhoto } from '../photoRecovery.js'
import PolicyLink from '../components/PolicyLink.jsx'
import './Processing.css'

// Progress bands written by reconstruction.js's simulated stage schedule — see the
// comment there for why this isn't real per-stage signal from InstantMesh.
const PROCESSING_STAGES = [
  { min: 0, label: 'Understanding the craft…' },
  { min: 30, label: 'Cleaning the image…' },
  { min: 50, label: 'Imagining multiple views…' },
  { min: 75, label: 'Creating the 3D model…' },
  { min: 95, label: 'Finishing touches…' },
]

function stageLabel(progress) {
  return PROCESSING_STAGES.reduce((label, s) => (progress >= s.min ? s.label : label), PROCESSING_STAGES[0].label)
}

// Real Processing screen: polls the jobs table every 2s, shows a progress
// bar + status, and either routes to the view screen (completed) or offers retry (failed).
export default function ProcessingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('queued')
  const [errorMessage, setErrorMessage] = useState('')
  const [craftId, setCraftId] = useState(null)
  const [done, setDone] = useState(false)
  const [pollError, setPollError] = useState(false)

  useEffect(() => {
    if (!jobId) return
    let intervalId = null
    let navTimer = null

    const poll = async () => {
      try {
        const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single()
        if (error) throw new Error('Failed to load job status')

        setProgress(data.progress || 0)
        setStatus(data.status)
        setCraftId(data.craft_id)
        if (data.error_message) setErrorMessage(data.error_message)

        if (data.status === 'completed') {
          if (intervalId) clearInterval(intervalId)
          setDone(true)
          // Reconstruction succeeded — the recovery copy (see photoRecovery.js) exists
          // only to survive a *failed* generation, no longer needed once there's a model.
          clearRecoveryPhoto(data.craft_id)
          navTimer = setTimeout(() => navigate(`/craft/${data.craft_id}/metadata`), 1000)
        } else if (data.status === 'failed') {
          if (intervalId) clearInterval(intervalId)
          setErrorMessage(data.error_message || 'The reconstruction failed.')
        }
      } catch {
        // Network/parse error — show a generic error state, don't crash.
        if (intervalId) clearInterval(intervalId)
        setPollError(true)
      }
    }

    poll()
    intervalId = setInterval(poll, 2000)

    return () => {
      if (intervalId) clearInterval(intervalId)
      if (navTimer) clearTimeout(navTimer)
    }
  }, [jobId, navigate])

  // Any state where the in-progress UI (spinner, bar, %) no longer applies — success,
  // failure, or "couldn't even check" all replace it with a fixed icon + message instead.
  const isTerminal = done || status === 'failed' || pollError

  // jobs.error_message is a plain string persisted by reconstruction.js's catch block —
  // no separate "was this a policy rejection" column, so matched on a stable phrase from
  // instantmesh-proxy's rejectionMessage() (server.js, §5d) rather than adding a migration
  // just to drive this link's visibility.
  const isPolicyViolation = status === 'failed' && errorMessage.includes('content guidelines')

  const getStatusText = () => {
    if (pollError) return 'Something went wrong while checking on your model.'
    if (done) return 'Done!'
    if (status === 'failed') return errorMessage || 'The reconstruction failed.'
    if (status === 'processing') return stageLabel(progress)
    return 'Waiting in queue...'
  }

  return (
    <div className="processing">
      <div className="processing__container">
        <header className="processing__header">
          <button
            type="button"
            className="processing__back"
            aria-label="Back"
            onClick={() => navigate(-1)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="processing__title">Creating your digital twin</h1>
        </header>

        <div className="processing__content">
          <div className="processing__card">
            {/* Terminal states (done / failed / can't-reach-server) never show the
                in-progress affordances — a spinner or a "X% complete" reading next to a
                failure message reads as broken, not just unpolished. */}
            {isTerminal ? (
              <div className={`processing__icon-badge processing__icon-badge--${done ? 'success' : 'error'}`}>
                {done ? (
                  <svg className="processing__check" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12.5" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
            ) : (
              <div className="processing__spinner" aria-hidden="true" />
            )}

            <p className={`processing__status ${!done && isTerminal ? 'processing__status--error' : ''}`}>
              {getStatusText()}
              {isPolicyViolation && <PolicyLink />}
            </p>

            {!isTerminal && (
              <>
                <div className="processing__bar">
                  <div className="processing__bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="processing__meta">{progress}% complete</p>
              </>
            )}

            {(status === 'failed' || pollError) && (
              <button
                type="button"
                className="processing__retry"
                onClick={() => navigate('/create', { state: craftId ? { recoverCraftId: craftId } : undefined })}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}