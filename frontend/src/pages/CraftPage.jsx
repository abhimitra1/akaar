import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './CraftPage.css'

// Real View screen: loads the craft detail (incl. model_url + owner_name via Supabase),
// renders the 3D model via <model-viewer>, and shows read-only metadata.
export default function CraftPage() {
  const { craftId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [craft, setCraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [shareCopied, setShareCopied] = useState(false)

  const handleShare = async () => {
    const shareUrl = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: craft?.title || 'AKAAR craft', url: shareUrl })
      } catch {
        // User cancelled the native share sheet — not an error.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // Clipboard API unavailable/denied — nothing more we can do without inventing UI.
    }
  }

  const handlePublish = async () => {
    if (publishing) return
    setPublishing(true)
    setPublishError('')
    try {
      const { data, error: updateError } = await supabase
        .from('crafts')
        .update({ is_public: true })
        .eq('id', craftId)
        .select()
        .single()
      if (updateError) throw new Error(updateError.message)
      setCraft((prev) => (prev ? { ...prev, is_public: data.is_public } : prev))
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
        const { data, error: dbError } = await supabase
          .from('crafts')
          .select('*')
          .eq('id', craftId)
          .single()
        // RLS hides private crafts you don't own — a missing row here means
        // either it doesn't exist or you're not allowed to see it.
        if (dbError) throw new Error('Craft not found')

        let ownerName = null
        if (data.owner_id) {
          const { data: owner } = await supabase
            .from('public_profiles')
            .select('full_name')
            .eq('id', data.owner_id)
            .single()
          ownerName = owner?.full_name ?? null
        }

        let modelUrl = null
        if (data.model_key) {
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.model_key)
          modelUrl = pub.publicUrl
        }

        if (!cancelled) setCraft({ ...data, owner_name: ownerName, model_url: modelUrl })
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
  }, [craftId])

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

  const isOwner = user && craft.owner_id === user.id

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
        {isOwner && (
          <button
            type="button"
            className="craft__edit"
            aria-label="Edit details"
            onClick={() => navigate(`/craft/${craftId}/metadata`)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        )}
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
            <button type="button" className="craft__btn craft__btn--ghost" onClick={handleShare}>
              {shareCopied ? 'Link copied!' : 'Share'}
            </button>
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
            {!craft.is_public && (
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