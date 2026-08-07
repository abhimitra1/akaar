import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { runReconstruction } from '../reconstruction.js'
import { useAuth } from '../context/AuthContext.jsx'
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
  const fileInputRef = useRef(null)

  const [photo, setPhoto] = useState(null) // { file, previewUrl }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [usedToday, setUsedToday] = useState(null) // null while loading

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

  const remaining = usedToday === null ? null : Math.max(0, DAILY_LIMIT - usedToday)
  const canSubmit = photo !== null && !submitting && remaining !== null && remaining > 0

  const handleFile = (e) => {
    const file = (e.target.files || [])[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setPhoto({ file, previewUrl: URL.createObjectURL(file) })
  }

  const removePhoto = () => setPhoto(null)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      // a. Create the craft record (no metadata yet) -> craft_id
      const { data: craft, error: createError } = await supabase
        .from('crafts')
        .insert({ owner_id: user.id })
        .select()
        .single()
      if (createError) throw new Error(createError.message)
      const craftId = craft.id

      // b. Upload the photo directly to Storage
      const path = `${user.id}/${craftId}/photos/0_${photo.file.name}`
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, photo.file, { contentType: photo.file.type || 'application/octet-stream' })
      if (uploadError) throw new Error(uploadError.message)
      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
      const { error: photosError } = await supabase
        .from('crafts')
        .update({ photos: [pub.publicUrl] })
        .eq('id', craftId)
      if (photosError) throw new Error(photosError.message)

      // c. Create the reconstruction job -> job_id, kick off generation
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({ craft_id: craftId, status: 'queued' })
        .select()
        .single()
      if (jobError) throw new Error(jobError.message)
      runReconstruction(job.id, craftId, user.id, photo.file)

      // d. Go to the processing screen
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
          <h1 className="create__title">Create Digital Twin</h1>
          {remaining !== null && (
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

        {remaining === 0 && (
          <div className="create__notice" role="status">
            You've used all {DAILY_LIMIT} creations for today. Come back tomorrow for more.
          </div>
        )}

        <div className="create__content">
          <section className="create__section">
            <span className="create__section-label">Photo</span>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFile}
            />

            {photo ? (
              <div className="create__thumbs">
                <div className="create__thumb">
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
              <button
                type="button"
                className="create__upload"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="create__upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="create__upload-text">Add a photo</span>
                <span className="create__upload-sub">Choose one photo of your craft</span>
              </button>
            )}
          </section>

          <button type="button" className="create__submit" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? 'Creating…' : 'Generate 3D Model'}
          </button>
        </div>
      </div>
    </div>
  )
}
