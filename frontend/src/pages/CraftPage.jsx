import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AiGeneratedBadge from '../components/AiGeneratedBadge.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { generateShareCard } from '../shareCard.js'
import '../pages/Home.css'
import './CraftPage.css'

const EXPLORE_MORE_LIMIT = 12

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
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const [likeCount, setLikeCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likeSubmitting, setLikeSubmitting] = useState(false)

  // "Explore More" strip at the end of the card — other public crafts, most recent first.
  const [exploreCrafts, setExploreCrafts] = useState([])
  const [exploreOwnerNames, setExploreOwnerNames] = useState({})

  // Viewer toggle: 3D model vs. the original source photo. '3d' is the default — only
  // matters when the craft actually has both (see hasModel/hasPhoto/activeMode below); a
  // craft with just one media type always shows that one regardless of this state.
  const [viewMode, setViewMode] = useState('3d')

  const modelViewerRef = useRef(null)

  // Generates a PATHS-branded shareable image (craft photo, title, maker, real stats, a QR
  // code back to this page — see shareCard.js) and hands it to the native share sheet when
  // the platform supports sharing files at all (navigator.canShare({files}) is the actual
  // capability check — navigator.share existing isn't enough, most desktop browsers have
  // the latter without the former). Where file-sharing isn't available, downloads the image
  // and copies share text (which includes the link, so it's never lost even though the
  // image itself can't carry a clickable URL) to the clipboard instead.
  const handleShare = async () => {
    if (sharing || !craft) return
    const shareUrl = window.location.href
    // Recomputed here rather than reused from the render-level `isOwner` below (declared
    // later in this component, so out of scope for this closure) — same check either way.
    const isSharerOwner = Boolean(user && craft.owner_id === user.id)
    const shareText = isSharerOwner
      ? `I designed "${craft.title || 'this craft'}" with PATHS Studio. ${shareUrl}`
      : `Look at this design from PATHS Studio — "${craft.title || 'a craft'}" by ${craft.owner_name || 'a PATHS maker'}. ${shareUrl}`

    setSharing(true)
    setShareError('')
    try {
      const blob = await generateShareCard(craft, { likeCount, shareUrl })
      const file = new File([blob], `paths-${craftId}.png`, { type: 'image/png' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: craft.title || 'PATHS craft', text: shareText })
        } catch {
          // User cancelled the native share sheet — not an error.
        }
      } else {
        const downloadUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = `paths-${craftId}.png`
        a.click()
        URL.revokeObjectURL(downloadUrl)

        try {
          await navigator.clipboard.writeText(shareText)
        } catch {
          // Clipboard API unavailable/denied — the image download still happened.
        }
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2500)
      }
    } catch (err) {
      setShareError(err.message || 'Failed to generate share image')
      setTimeout(() => setShareError(''), 3000)
    } finally {
      setSharing(false)
    }
  }

  // Hands this craft to /create as a ready-made co-creation source, so the flow lands
  // straight in Co-Create mode with the photo already picked instead of making the user
  // find it again in the library picker (see CreatePage's cocreateSource handling and
  // CoCreatePanel's initialDesign prop). Guests get bounced to /welcome first, same as
  // handleToggleLike — co-creation needs an account (it becomes a new craft owned by them).
  const handleCoCreate = () => {
    if (!user) {
      navigate('/welcome')
      return
    }
    navigate('/create', { state: { cocreateSource: craft } })
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

  // Guests get bounced to /welcome, same as ProtectedRoute does for a protected route —
  // liking requires an account (records `user_id`), but viewing/counting doesn't.
  const handleToggleLike = async () => {
    if (!user) {
      navigate('/welcome')
      return
    }
    if (likeSubmitting) return
    setLikeSubmitting(true)
    try {
      if (liked) {
        const { error: deleteError } = await supabase
          .from('likes')
          .delete()
          .eq('craft_id', craftId)
          .eq('user_id', user.id)
        if (deleteError) throw deleteError
        setLiked(false)
        setLikeCount((c) => Math.max(0, c - 1))
      } else {
        const { error: insertError } = await supabase
          .from('likes')
          .insert({ craft_id: craftId, user_id: user.id })
        if (insertError) throw insertError
        setLiked(true)
        setLikeCount((c) => c + 1)
      }
    } catch (err) {
      // Best-effort, like LibraryPage's storage cleanup — a failed like/unlike isn't worth
      // a full error banner; log and leave the count/button exactly as it was.
      console.error('Failed to update like:', err.message || err)
    } finally {
      setLikeSubmitting(false)
    }
  }

  // Separate from the craft-detail load below: count is public (every viewer, including
  // guests, per likes_select RLS), "did I like this" only applies once `user` exists.
  useEffect(() => {
    let cancelled = false
    const loadLikes = async () => {
      const { count } = await supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('craft_id', craftId)
      if (!cancelled) setLikeCount(count ?? 0)

      if (!user) {
        if (!cancelled) setLiked(false)
        return
      }
      const { data } = await supabase
        .from('likes')
        .select('id')
        .eq('craft_id', craftId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!cancelled) setLiked(Boolean(data))
    }
    loadLikes()
    return () => {
      cancelled = true
    }
  }, [craftId, user])

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

  // "Explore More" row at the bottom of the page — other public crafts to browse next,
  // same is_public-only scope as Explore/HomePage's featured row. Independent of the main
  // craft-detail load above so a slow/failed fetch here never blocks the page's primary
  // content.
  useEffect(() => {
    let cancelled = false
    const loadExploreMore = async () => {
      const { data, error: dbError } = await supabase
        .from('crafts')
        .select('*')
        .eq('is_public', true)
        .neq('id', craftId)
        .order('created_at', { ascending: false })
        .limit(EXPLORE_MORE_LIMIT)
      if (cancelled || dbError) return
      setExploreCrafts(data || [])

      const ownerIds = [...new Set((data || []).map((c) => c.owner_id))]
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('public_profiles')
          .select('id, full_name')
          .in('id', ownerIds)
        if (!cancelled && owners) {
          setExploreOwnerNames(Object.fromEntries(owners.map((o) => [o.id, o.full_name])))
        }
      }
    }
    loadExploreMore()
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
  // Mirrors CreatePage's canCoCreate (and guard_craft_image_source() in schema.sql, the
  // real enforcement) — visitors and super admins can co-create, artisans have their own
  // upload flow instead. Guests (no user yet) still see the button since most anonymous
  // viewers are visitors by default; handleCoCreate sends them to log in first.
  const canCoCreate = !user || user.is_super_admin || user.role === 'visitor'

  const getExploreThumbnail = (c) => (c.photos && c.photos.length > 0 ? c.photos[0] : null)

  const hasModel = Boolean(craft.model_url)
  const hasPhoto = Boolean(craft.photos && craft.photos.length > 0)
  // Falls back to whichever media actually exists — viewMode only matters (and the toggle
  // only renders) when both are available; a craft with just one media type always shows it.
  const activeMode = viewMode === 'image' && hasPhoto ? 'image' : hasModel ? '3d' : hasPhoto ? 'image' : '3d'

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
        {craft.image_source === 'ai_generated' && <AiGeneratedBadge className="craft__ai-badge" />}

        <div className="craft__header-actions">
          <button
            type="button"
            className="craft__icon-btn"
            aria-label="Share"
            onClick={handleShare}
            disabled={sharing}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          {canCoCreate && (
            <button
              type="button"
              className="craft__icon-btn craft__icon-btn--ai"
              aria-label="Co-Create with AI"
              onClick={handleCoCreate}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none">
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                <path d="M19 3l.6 1.7L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.3L19 3z" />
              </svg>
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className="craft__icon-btn craft__icon-btn--edit"
              aria-label="Edit details"
              onClick={() => navigate(`/craft/${craftId}/metadata`)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="craft__content">
        <div className="craft__media">
          {activeMode === '3d' && hasModel ? (
            <model-viewer
              ref={modelViewerRef}
              className="craft__viewer"
              src={craft.model_url}
              alt={craft.title}
              camera-controls
              auto-rotate
              ar
              ar-modes="webxr scene-viewer quick-look"
              // `src` must stay set at all times — this model-viewer version's AR-capability
              // check (canActivateAR) is hard-gated on `this.src != null`, confirmed by reading
              // its source directly. An earlier attempt at "true-to-life" scaling swapped `src`
              // for an `<extra-model>` when craft.height_cm was set, which silently disabled AR
              // for every craft with a height on file (and also broke camera framing, rendering
              // the model tiny) — see AGENTS.md 2026-08-08 entry and the 2026-08-14 fix. Reverted
              // to always rendering the model at its native reconstructed scale; height_cm is
              // still saved and shown in the metadata table below, just no longer used to warp
              // the 3D/AR render.
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
          ) : activeMode === 'image' && hasPhoto ? (
            <img src={craft.photos[0]} alt={craft.title} className="craft__photo" />
          ) : (
            <div className="craft__no-model">No 3D model yet — it may still be processing.</div>
          )}

          {hasModel && hasPhoto && (
            <div className="craft__view-toggle" role="tablist" aria-label="Viewer mode">
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === '3d'}
                className={`craft__view-toggle-btn ${activeMode === '3d' ? 'craft__view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('3d')}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
                  <path d="M12 22V12" />
                  <path d="M20 6.5L12 12 4 6.5" />
                </svg>
                3D
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'image'}
                className={`craft__view-toggle-btn ${activeMode === 'image' ? 'craft__view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('image')}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Photo
              </button>
            </div>
          )}
        </div>

        <div className="craft__card">
          <p className="craft__story">{craft.story}</p>
          <div className="craft__like-row">
            <p className="craft__creator">By {craft.owner_name || `Creator #${craft.owner_id}`}</p>
            <button
              type="button"
              className={`craft__like-btn ${liked ? 'craft__like-btn--active' : ''}`}
              onClick={handleToggleLike}
              disabled={likeSubmitting}
              aria-label={liked ? 'Unlike this craft' : 'Like this craft'}
              aria-pressed={liked}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
              <span>{likeCount}</span>
            </button>
          </div>
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
            {canCoCreate && (
              <button type="button" className="craft__btn craft__btn--ai" onClick={handleCoCreate}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none" aria-hidden="true">
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                  <path d="M19 3l.6 1.7L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.3L19 3z" />
                </svg>
                Co-Create with AI
              </button>
            )}
            {shareError && <p className="craft__publish-error">{shareError}</p>}
            <button type="button" className="craft__btn craft__btn--ghost" onClick={handleShare} disabled={sharing}>
              {sharing ? 'Preparing image…' : shareCopied ? 'Image downloaded, link copied!' : 'Share'}
            </button>
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

        {exploreCrafts.length > 0 && (
          <div className="home__featured-section craft__explore-section">
            <div className="home__section-header">
              <h2 className="home__section-title">Explore More</h2>
              <Link to="/explore" className="home__section-link">View all</Link>
            </div>
            <div className="home__featured-row">
              {exploreCrafts.map((c) => (
                <article
                  key={c.id}
                  className="home__featured-card"
                  onClick={() => navigate(`/craft/${c.id}`)}
                >
                  <div className="home__featured-image-wrapper">
                    {getExploreThumbnail(c) ? (
                      <img src={getExploreThumbnail(c)} alt={c.title} className="home__featured-image" loading="lazy" />
                    ) : (
                      <div className="home__thumb-placeholder home__thumb-placeholder--featured" />
                    )}
                    {c.image_source === 'ai_generated' && <AiGeneratedBadge />}
                  </div>
                  <div className="home__featured-body">
                    <h3 className="home__featured-title">{c.title}</h3>
                    <p className="home__featured-subtitle">By {exploreOwnerNames[c.owner_id] || 'Unknown creator'}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}