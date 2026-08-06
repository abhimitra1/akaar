import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './CraftPage.css'

// Real View screen: loads the craft detail (incl. model_url + owner_name from the
// backend), renders the 3D model via <model-viewer>, and shows read-only metadata.
export default function CraftPage() {
  const { craftId } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const [craft, setCraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const handlePublish = async () => {
    if (publishing) return
    setPublishing(true)
    setPublishError('')
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      const res = await fetch(`${API_BASE_URL}/api/crafts/${craftId}/publish`, {
        method: 'PATCH',
        headers,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Failed to publish')
      setCraft((prev) => (prev ? { ...prev, is_public: data.is_public ?? true } : prev))
    } catch (err) {
      setPublishError(err.message || 'Something went wrong')
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
        const res = await fetch(`${API_BASE_URL}/api/crafts/${craftId}`, { headers })
        if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to continue' : 'Failed to load craft')
        const data = await res.json()
        if (!cancelled) setCraft(data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [craftId, accessToken])

  if (loading) {
    return <LoadingScreen message="Loading craft details..." />
  }

  if (error || !craft) {
    return (
      <div className="craft">
        <div className="craft__card">
          <p className="craft__error">{error || 'Craft not found'}</p>
          <button type="button" className="craft__btn craft__btn--primary" onClick={() => navigate('/')}>
            Back to Home
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
    ['Weight', craft.weight != null ? `${craft.weight} kg` : null],
    ['Location', craft.location],
    ['Year', craft.year],
  ].filter(([, v]) => v != null && v !== '')

  return (
    <div className="craft">
      <header className="craft__header">
        <button
          type="button"
          className="craft__back"
          aria-label="Back"
          onClick={() => navigate('/')}
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
        <h1 className="craft__title">{craft.title}</h1>
      </header>

      <div className="craft__content">
        {craft.model_url ? (
          <model-viewer
            className="craft__viewer"
            src={craft.model_url}
            alt={craft.title}
            camera-controls
            auto-rotate
            style={{ width: '100%', height: '400px' }}
          />
        ) : (
          <div className="craft__no-model">No 3D model yet — it may still be processing.</div>
        )}

        <div className="craft__card">
          <p className="craft__story">{craft.story}</p>
          <p className="craft__creator">By {craft.owner_name || `Creator #${craft.owner_id}`}</p>

          <dl className="craft__meta">
            {metaRows.map(([label, value]) => (
              <div className="craft__meta-row" key={label}>
                <dt className="craft__meta-label">{label}</dt>
                <dd className="craft__meta-value">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="craft__actions">
            {craft.model_url && (
              <a
                className="craft__btn craft__btn--primary"
                href={craft.model_url}
                download
              >
                Download
              </a>
            )}
            {publishError && <p className="craft__publish-error">{publishError}</p>}
            {craft.is_public ? (
              <button type="button" className="craft__btn craft__btn--published" disabled>
                Published
              </button>
            ) : (
              <button
                type="button"
                className="craft__btn craft__btn--ghost"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}