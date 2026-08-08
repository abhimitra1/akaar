import { useEffect, useRef, useState } from 'react'
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

  const modelViewerRef = useRef(null)
  // "x y z" scale-multiplier string once known, or null before that / when no height_cm is
  // set. InstantMesh's single-image reconstruction has no way to know a model's real
  // physical size, so its GLB's baked-in scale is arbitrary — when the craft has a real
  // height, this corrects it so the on-page preview AND AR placement (which reads the same
  // scaled scene when generating its USDZ, see <extra-model> below) show true-to-life size.
  const [computedScale, setComputedScale] = useState(null)

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

        // If this craft has no permission to see, RLS just returns no row here — the
        // "Based on" link simply won't render, which is correct (no leaking that a private
        // parent even exists).
        let parentTitle = null
        if (data.parent_design_id) {
          const { data: parent } = await supabase
            .from('crafts')
            .select('title')
            .eq('id', data.parent_design_id)
            .single()
          parentTitle = parent?.title ?? null
        }

        if (!cancelled) {
          setCraft({ ...data, owner_name: ownerName, model_url: modelUrl, parent_title: parentTitle })
        }
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

  // Two-phase: the model first loads at its native (arbitrary) scale so getDimensions()
  // can read its actual authored height, then — only if craft.height_cm is set — we swap to
  // an <extra-model> (the only way this model-viewer version exposes a scale multiplier for
  // the primary model; a plain `scale` attribute doesn't exist on <model-viewer> itself,
  // verified against the installed @google/model-viewer source, not assumed) carrying the
  // computed correction factor, which triggers one visible reload at the corrected size.
  useEffect(() => {
    setComputedScale(null)
    const mv = modelViewerRef.current
    if (!mv || craft?.height_cm == null || !craft.model_url) return

    const measure = () => {
      const dims = mv.getDimensions?.()
      if (!dims?.y) return
      const factor = (craft.height_cm / 100) / dims.y
      if (Number.isFinite(factor) && factor > 0) {
        setComputedScale(`${factor} ${factor} ${factor}`)
      }
    }

    if (mv.loaded) {
      measure()
      return
    }
    mv.addEventListener('load', measure, { once: true })
    return () => mv.removeEventListener('load', measure)
  }, [craft?.height_cm, craft?.model_url])

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
    ['Height', craft.height_cm != null ? `${craft.height_cm} cm` : null],
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
            ref={modelViewerRef}
            className="craft__viewer"
            src={computedScale ? undefined : craft.model_url}
            alt={craft.title}
            camera-controls
            auto-rotate
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale={craft.height_cm != null ? 'fixed' : 'auto'}
            // Best-effort mitigation for a known category of issue with this library
            // version's iOS AR path: without a pre-made .usdz (ios-src), it converts the
            // GLB to USDZ client-side via three.js's USDZExporter on every "View in AR" tap,
            // and that exporter can drop/mis-map some texture setups — capping the export
            // texture size is a commonly-cited workaround, not a guaranteed fix (couldn't
            // verify on real iOS hardware this session). A real fix would need either a
            // proper server-side USDZ pipeline (not built) or changes to InstantMesh's own
            // GLB/material export, which is out of this repo's scope (AGENTS.md rule 2).
            ar-usdz-max-texture-size="2048"
            style={{ width: '100%', height: '400px' }}
          >
            {computedScale && <extra-model src={craft.model_url} scale={computedScale} />}
            {/* model-viewer auto-hides this slotted button on devices/browsers that can't
                do AR (no usdz for iOS Quick Look, no WebXR/Scene Viewer support, desktop) —
                no manual capability check needed. */}
            <button slot="ar-button" type="button" className="craft__ar-btn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
                <path d="M12 22V12" />
                <path d="M20 6.5L12 12 4 6.5" />
              </svg>
              View in AR
            </button>
          </model-viewer>
        ) : (
          <div className="craft__no-model">No 3D model yet — it may still be processing.</div>
        )}

        <div className="craft__card">
          <p className="craft__story">{craft.story}</p>
          <p className="craft__creator">By {craft.owner_name || `Creator #${craft.owner_id}`}</p>
          {craft.parent_design_id != null && (
            <p className="craft__related">
              Based on:{' '}
              <button
                type="button"
                className="craft__related-link"
                onClick={() => navigate(`/craft/${craft.parent_design_id}`)}
              >
                {craft.parent_title || 'Untitled'}
              </button>
            </p>
          )}

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