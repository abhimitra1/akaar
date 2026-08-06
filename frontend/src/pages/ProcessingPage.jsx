import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Processing.css'

// Real Processing screen: polls GET /api/jobs/{job_id} every 2s, shows a progress
// bar + status, and either routes to the view screen (completed) or offers retry (failed).
export default function ProcessingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('queued')
  const [errorMessage, setErrorMessage] = useState('')
  const [done, setDone] = useState(false)
  const [pollError, setPollError] = useState(false)

  useEffect(() => {
    if (!jobId) return
    let intervalId = null
    let navTimer = null

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        })
        if (!res.ok) throw new Error('Failed to load job status')
        const data = await res.json()

        setProgress(data.progress || 0)
        setStatus(data.status)
        if (data.error) setErrorMessage(data.error)

        if (data.status === 'completed') {
          if (intervalId) clearInterval(intervalId)
          setDone(true)
          navTimer = setTimeout(() => navigate(`/craft/${data.craft_id}`), 1000)
        } else if (data.status === 'failed') {
          if (intervalId) clearInterval(intervalId)
          setErrorMessage(data.error || 'The reconstruction failed.')
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
  }, [jobId, accessToken, navigate])

  const getStatusText = () => {
    if (pollError) return 'Something went wrong while checking on your model.'
    if (done) return 'Done!'
    if (status === 'failed') return errorMessage || 'The reconstruction failed.'
    if (status === 'processing') return 'AI is reconstructing your model...'
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
            {!pollError && !done && (
              <div className="processing__spinner" aria-hidden="true" />
            )}

            <p className="processing__status">
              {done && (
                <svg className="processing__check" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              {getStatusText()}
            </p>

            {!pollError && !done && (
              <div className="processing__bar">
                <div className="processing__bar-fill" style={{ width: `${progress}%` }} />
              </div>
            )}

            {!pollError && !done && (
              <p className="processing__meta">{progress}% complete</p>
            )}

            {pollError && (
              <p className="processing__error">We couldn&rsquo;t reach the server. Please check your connection and try again.</p>
            )}

            {status === 'failed' && (
              <button
                type="button"
                className="processing__retry"
                onClick={() => navigate('/create')}
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