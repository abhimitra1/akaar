import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { runReconstruction } from '../reconstruction.js'
import { compressImage } from '../imageCompression.js'
import CoCreatePanel from '../components/CoCreatePanel.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { saveRecoveryPhoto, loadRecoveryPhoto, clearRecoveryPhoto } from '../photoRecovery.js'
import './Create.css'

// Matches supabase/schema.sql's check_daily_job_limit() trigger — that's the source of
// truth (holds regardless of entry point); this is only for showing the count and
// avoiding a wasted photo upload when it's already known to be blocked.
const DAILY_LIMIT = 5

function startOfUtcDayISO() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

// Create flow, step 1+2 of 4 (see AGENTS.md §3 Phase 2): upload a single photo, then
// generate the 3D model. Metadata is added afterward, on the Processing → Metadata step
// (MetadataPage.jsx), once the craft record already exists.
export default function CreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef(null)
  // Separate hidden input, `capture="environment"` — on its own, accept="image/*" is
  // supposed to let mobile browsers offer a camera option in their native chooser, but
  // that's inconsistent across Android OEM skins/browsers (reported: no camera option
  // showed up at all on some Android devices). A dedicated capture-attribute input
  // guarantees "Take Photo" always opens the camera directly, instead of hoping the
  // device's chooser surfaces it.
  const cameraInputRef = useRef(null)

  // null = neither method chosen yet — user must pick one before either form appears.
  const [mode, setMode] = useState(null) // null | 'upload' | 'cocreate'
  const [photo, setPhoto] = useState(null) // { file, previewUrl }
  // Set only when `photo` came from CoCreatePanel picking an existing library design as its
  // starting point ({ id, title } of that design, from CoCreatePanel's onAccepted 3rd arg).
  // That design is never modified — this is purely a parent-lineage pointer, written once
  // onto the NEW craft below as `parent_design_id` so "based on X" persists without
  // touching X itself.
  const [parentDesign, setParentDesign] = useState(null)
  // True once the current `photo` came out of CoCreatePanel (Fooocus) rather than a direct
  // file pick — independent of `mode`, which handleCoCreateAccepted below resets to
  // 'upload' so the rest of the flow doesn't need to special-case co-created photos.
  // Recorded onto the craft as `image_source` at submit time (see handleSubmit).
  const [isAiGenerated, setIsAiGenerated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [usedToday, setUsedToday] = useState(null) // null while loading

  // True while CoCreatePanel has a Fooocus job in flight (see its onGeneratingChange).
  // Leaving mid-job doesn't cancel it server-side — it keeps running and still counts
  // against the hourly submission budget — so navigating away needs a confirm step.
  const [coCreateGenerating, setCoCreateGenerating] = useState(false)
  const [pendingLeaveAction, setPendingLeaveAction] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfUtcDayISO())
      .then(({ count }) => {
        if (!cancelled) setUsedToday(count ?? 0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Landed here from ProcessingPage's "Try again" after a failed reconstruction (see
  // photoRecovery.js) — restore the photo it cached instead of making the user re-pick or
  // redo an AI co-creation. Consumed once: cleared right after loading so it can't leak
  // into a later, unrelated visit to this page.
  useEffect(() => {
    const recoverCraftId = location.state?.recoverCraftId
    if (!recoverCraftId) return
    const recovered = loadRecoveryPhoto(recoverCraftId)
    if (recovered) {
      setPhoto({ file: recovered.file, previewUrl: recovered.previewUrl })
      setParentDesign(recovered.parentDesign)
      setIsAiGenerated(recovered.isAiGenerated)
      setMode('upload')
    }
    clearRecoveryPhoto(recoverCraftId)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Covers closing the tab / refreshing / navigating to a different URL while a co-creation
  // is in flight — the one leave path a confirm *dialog* can't intercept (the browser shows
  // its own native prompt instead; the message text below is ignored by modern browsers,
  // which show a fixed generic warning, but the listener itself is what triggers it).
  useEffect(() => {
    if (!coCreateGenerating) return
    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [coCreateGenerating])

  // In-app navigation (the header back button, switching to the Upload Photo tab) goes
  // through this instead of acting immediately whenever a co-creation is in flight — asks
  // first via ConfirmDialog rather than silently abandoning it.
  const guardLeaveCoCreate = (action) => {
    if (coCreateGenerating) {
      setPendingLeaveAction(() => action)
    } else {
      action()
    }
  }

  // profiles.unlimited_creations (fetched onto `user` by AuthContext) exempts testers/staff
  // from the daily count — mirrors check_daily_job_limit()'s bypass in schema.sql, otherwise
  // this client-side gate blocks the button before that trigger ever gets a chance to run.
  const unlimited = user?.unlimited_creations === true
  const remaining = usedToday === null ? null : Math.max(0, DAILY_LIMIT - usedToday)
  const canSubmit = photo !== null && !submitting && (unlimited || (remaining !== null && remaining > 0))

  // Artisans document real objects (original upload); visitors redesign with AI
  // (co-creation) — never both. Mirrors guard_craft_image_source() in schema.sql, which
  // is the actual enforcement (this is only UX: a hidden card isn't a security boundary).
  // Super admins get both, mainly so they can exercise/test either path.
  const canUpload = user?.is_super_admin || user?.role === 'artisan'
  const canCoCreate = user?.is_super_admin || user?.role === 'visitor'

  // Skips the method-picker screen entirely when a role only has one legitimate choice —
  // showing a "pick a method" grid with a single card in it is just an extra click.
  useEffect(() => {
    if (mode !== null || !user) return
    if (canUpload && !canCoCreate) setMode('upload')
    else if (canCoCreate && !canUpload) setMode('cocreate')
  }, [mode, user, canUpload, canCoCreate])

  const handleFile = async (e) => {
    const file = (e.target.files || [])[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    const compressed = await compressImage(file)
    setPhoto({ file: compressed, previewUrl: URL.createObjectURL(compressed) })
    setParentDesign(null)
    setIsAiGenerated(false)
  }

  const removePhoto = () => {
    setPhoto(null)
    setParentDesign(null)
    setIsAiGenerated(false)
  }

  // Hands the accepted co-created image to the exact same photo state a normal file pick
  // would set — the rest of the flow (preview, submit, upload, reconstruction) is identical
  // either way, so co-creation needs no special-casing past this point. `sourceDesign` is
  // only set when the co-creation started from a library pick (see CoCreatePanel) — carried
  // into the craft insert below as `parent_design_id`.
  const handleCoCreateAccepted = async (file, previewUrl, sourceDesign) => {
    // Fooocus returns an uncompressed PNG — same compression pass as a normal upload
    // before it becomes the craft's stored photo; previewUrl (already a data URL from the
    // review step) still matches visually, so it's kept as-is rather than regenerated.
    const compressed = await compressImage(file)
    setPhoto({ file: compressed, previewUrl })
    setParentDesign(sourceDesign || null)
    setIsAiGenerated(true)
    setMode('upload')
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      // a. Create the craft record (no metadata, no photo yet) -> craft_id. parent_design_id
      // records where a co-created starting photo came from a library pick — the source
      // (parent) craft itself is never written to, only read (see
      // CoCreatePanel/handleCoCreateAccepted). The photo itself isn't uploaded here — see
      // reconstruction.js: it's only stored once InstantMesh (content moderation included)
      // has actually accepted it, so a flagged photo never reaches Storage or Library at all.
      const { data: craft, error: createError } = await supabase
        .from('crafts')
        .insert({
          owner_id: user.id,
          image_source: isAiGenerated ? 'ai_generated' : 'original',
          ...(parentDesign ? { parent_design_id: parentDesign.id } : {}),
        })
        .select()
        .single()
      if (createError) throw new Error(createError.message)
      const craftId = craft.id

      // b. Create the reconstruction job -> job_id, kick off generation
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({ craft_id: craftId, status: 'queued' })
        .select()
        .single()
      if (jobError) throw new Error(jobError.message)

      // Cache the photo locally right as it's handed off to 3D generation — if
      // reconstruction fails for a non-moderation reason, ProcessingPage's "Try again" can
      // restore it here instead of losing it (see photoRecovery.js). Cleared on success, on
      // a moderation rejection, or once restored on retry.
      await saveRecoveryPhoto(craftId, photo.file, parentDesign, isAiGenerated)
      runReconstruction(job.id, craftId, user.id, photo.file)

      // c. Go to the processing screen
      navigate(`/processing/${job.id}`)
    } catch (err) {
      // e. On failure: show error and stay on this page
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="create">
      <div className="create__card">
        <header className="create__header">
          <button
            type="button"
            className="create__back"
            aria-label="Back"
            onClick={() => guardLeaveCoCreate(() => navigate(-1))}
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
          <h1 className="create__title">Create Digital Twin</h1>
          {!unlimited && remaining !== null && (
            <span className="create__credits">
              {remaining} of {DAILY_LIMIT} creations left today
            </span>
          )}
        </header>

        {error && (
          <div className="create__error" role="alert">
            {error}
          </div>
        )}

        {!unlimited && remaining === 0 && (
          <div className="create__notice" role="status">
            You've used all {DAILY_LIMIT} creations for today. Come back tomorrow for more.
          </div>
        )}

        <div className="create__content">
          {mode === null ? (
            <div className="create__method-grid">
              {canUpload && (
                <button type="button" className="create__method-card" onClick={() => setMode('upload')}>
                  <span className="create__method-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </span>
                  <span className="create__method-title">Upload Photo</span>
                  <span className="create__method-desc">Choose one photo of your craft to turn into a 3D model</span>
                </button>
              )}

              {canCoCreate && (
                <button type="button" className="create__method-card" onClick={() => setMode('cocreate')}>
                  <span className="create__method-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                      <path d="M19 3l.6 1.7L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.3L19 3z" />
                    </svg>
                  </span>
                  <span className="create__method-title">Co-Create with AI</span>
                  <span className="create__method-desc">Redesign a photo or an existing design with AI first</span>
                </button>
              )}
            </div>
          ) : (
            <div className="create__method-active">
              {/* Only worth offering when the account can actually use both methods —
                  for a single-role user this would just flip straight back (see the
                  auto-select effect above), a dead-end click. */}
              {canUpload && canCoCreate && (
                <button
                  type="button"
                  className="create__method-change"
                  onClick={() => guardLeaveCoCreate(() => setMode(null))}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Change method
                </button>
              )}

              {mode === 'cocreate' ? (
                <CoCreatePanel onAccepted={handleCoCreateAccepted} onGeneratingChange={setCoCreateGenerating} />
              ) : (
                <>
                  <section className="create__section">
                    <span className="create__section-label">Photo</span>

                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={handleFile}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleFile}
                    />

                    {photo ? (
                      <div className="create__thumbs">
                        <div className="create__thumb create__thumb--large">
                          <img src={photo.previewUrl} alt="Selected craft photo" />
                          <button
                            type="button"
                            className="create__thumb-remove"
                            aria-label="Remove photo"
                            onClick={removePhoto}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="create__method-grid">
                        <button
                          type="button"
                          className="create__method-card"
                          onClick={() => cameraInputRef.current?.click()}
                        >
                          <span className="create__method-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                          </span>
                          <span className="create__method-title">Take Photo</span>
                        </button>

                        <button
                          type="button"
                          className="create__method-card"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <span className="create__method-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                          </span>
                          <span className="create__method-title">Choose from Gallery</span>
                        </button>
                      </div>
                    )}
                  </section>

                  <button type="button" className="create__submit" disabled={!canSubmit} onClick={handleSubmit}>
                    {submitting ? 'Creating…' : 'Generate 3D Model'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingLeaveAction !== null}
        title="Leave while generating?"
        message="Your AI design is still being generated. Leaving now won't stop it — it still counts toward your hourly generation limit — but you'll lose the result."
        confirmLabel="Leave"
        cancelLabel="Stay"
        danger
        onConfirm={() => {
          const action = pendingLeaveAction
          setPendingLeaveAction(null)
          action?.()
        }}
        onCancel={() => setPendingLeaveAction(null)}
      />
    </div>
  )
}
