import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { submitImagePrompt, getJobStatus, base64ToFile } from '../fooocus.js'
import { compressImage } from '../imageCompression.js'
import PolicyLink from './PolicyLink.jsx'

const POLL_INTERVAL_MS = 2000

// Fetches an existing craft's photo as a File, so a picked library design can feed the
// exact same source-image path a normal file upload uses (fetch -> submitImagePrompt).
async function craftPhotoToFile(craft) {
  const photoUrl = craft.photos?.[0]
  if (!photoUrl) throw new Error('That design has no photo to redesign from')
  const res = await fetch(photoUrl)
  if (!res.ok) throw new Error('Failed to load that design\'s photo')
  const blob = await res.blob()
  return new File([blob], `design-${craft.id}.jpg`, { type: blob.type || 'image/jpeg' })
}

// Co-creation: redesign an existing item photo with Fooocus before committing to full 3D
// reconstruction (which costs a daily credit and real GPU time). Self-contained step
// machine — input (pick photo + prompt) -> generating (poll) -> review (accept/retry) ->
// confirm (view in 3D?). On acceptance it hands the result back to CreatePage as a plain
// File, the same shape a normal photo pick produces, so the rest of the create flow
// (upload, job creation, reconstruction) needs no co-creation-specific handling at all.
//
// Source photo can come from two places: a fresh upload, or an existing design picked from
// the library (search below). Picking a library design does NOT modify that design's craft
// row at all — it's read-only here — the redesign becomes a brand-new craft once accepted;
// `onAccepted`'s 3rd argument carries {id, title} of the source design so CreatePage can
// record the lineage (crafts.parent_design_id) on the new craft, so "based on X" persists
// without ever touching X itself.
//
// `onGeneratingChange` (optional) is called with true/false whenever `step` enters/leaves
// 'generating' — lets CreatePage warn before navigating away mid-job (the submitted Fooocus
// job keeps running server-side and still counts against the hourly submission budget
// regardless of whether anyone's still watching it; see CreatePage's leave-guard).
// `initialDesign` (optional): a full craft record ({ id, title, photos, ... }) to seed the
// source photo with immediately, bypassing the upload/library picker — used when arriving
// here from a craft detail page's "Co-Create with AI" button (see CreatePage.jsx).
export default function CoCreatePanel({ onAccepted, onGeneratingChange, initialDesign }) {
  const fileInputRef = useRef(null)
  // See CreatePage.jsx's identical cameraInputRef comment — accept="image/*" alone doesn't
  // reliably surface a camera option in every Android browser/OEM chooser; a dedicated
  // capture-attribute input guarantees one.
  const cameraInputRef = useRef(null)

  const [step, setStep] = useState('input') // input | generating | review | confirm
  const [sourceTab, setSourceTab] = useState('upload') // 'upload' | 'library' — only matters pre-pick
  const [source, setSource] = useState(null) // { file, previewUrl }
  const [selectedDesign, setSelectedDesign] = useState(null) // { id, title } | null — set only via library pick
  const [prompt, setPrompt] = useState('')
  const [progress, setProgress] = useState(0)
  const [resultOptions, setResultOptions] = useState([]) // base64 strings — 2 variations per generation
  const [selectedIndex, setSelectedIndex] = useState(null) // which variation the user picked, if any
  const [error, setError] = useState('')
  const [errorIsPolicyViolation, setErrorIsPolicyViolation] = useState(false)

  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryResults, setLibraryResults] = useState(null) // null = not fetched yet
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState('')

  // Lazy-load the library the first time the tab is opened, not on every panel mount —
  // most co-creations start from a fresh upload, no need to pay for this query then.
  useEffect(() => {
    if (sourceTab !== 'library' || libraryResults !== null) return
    let cancelled = false
    setLibraryLoading(true)
    setLibraryError('')
    supabase
      .from('crafts')
      .select('id, title, photos, craft_type')
      .order('created_at', { ascending: false })
      .then(({ data, error: dbError }) => {
        if (cancelled) return
        if (dbError) {
          setLibraryError(dbError.message)
          setLibraryResults([])
        } else {
          // RLS already scoped this to public crafts + the caller's own — only need to
          // additionally drop the ones with no photo, since there's nothing to redesign from.
          setLibraryResults((data || []).filter((c) => c.photos && c.photos.length > 0))
        }
        setLibraryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sourceTab, libraryResults])

  useEffect(() => {
    onGeneratingChange?.(step === 'generating')
  }, [step, onGeneratingChange])

  // Seeds the source photo from initialDesign on mount, same as picking it from the
  // library (handlePickLibraryDesign below) — but reports failure via the top-level
  // `error` banner rather than `libraryError`, since that only renders inside the library
  // tab, which never mounts when a source arrives this way.
  useEffect(() => {
    if (!initialDesign) return
    let cancelled = false
    craftPhotoToFile(initialDesign)
      .then((file) => {
        if (cancelled) return
        setSource({ file, previewUrl: initialDesign.photos[0] })
        setSelectedDesign({ id: initialDesign.id, title: initialDesign.title })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load that design')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step !== 'generating') return
    let cancelled = false

    const run = async () => {
      try {
        const jobId = await submitImagePrompt(source.file, prompt.trim(), { imageNumber: 2 })

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelled) return
          const status = await getJobStatus(jobId)
          if (cancelled) return

          if (status.job_stage === 'SUCCESS') {
            const results = (status.job_result || []).filter((r) => r?.base64).map((r) => r.base64)
            if (results.length === 0) throw new Error('No image returned')
            setResultOptions(results)
            setSelectedIndex(null)
            setStep('review')
            return
          }
          if (status.job_stage === 'ERROR') {
            throw new Error(status.job_status || 'Co-creation failed')
          }
          setProgress(status.job_progress || 0)
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }
      } catch (err) {
        if (cancelled) return
        setError(err.message || 'Something went wrong')
        // 422 is instantmesh-proxy's content-moderation-rejection status (see fooocus.js,
        // AGENTS.md §5d) — shows a link to the AI Usage Policy alongside the message.
        setErrorIsPolicyViolation(err.status === 422)
        setStep('input')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const handleSourceFile = async (e) => {
    const file = (e.target.files || [])[0]
    e.target.value = ''
    if (!file) return
    const compressed = await compressImage(file)
    setSource({ file: compressed, previewUrl: URL.createObjectURL(compressed) })
    setSelectedDesign(null)
  }

  const handleRemoveSource = () => {
    setSource(null)
    setSelectedDesign(null)
  }

  const handlePickLibraryDesign = async (craft) => {
    setLibraryError('')
    try {
      const file = await craftPhotoToFile(craft)
      setSource({ file, previewUrl: craft.photos[0] })
      setSelectedDesign({ id: craft.id, title: craft.title })
    } catch (err) {
      setLibraryError(err.message || 'Failed to load that design')
    }
  }

  const handleGenerate = () => {
    if (!source || prompt.trim() === '') return
    setError('')
    setErrorIsPolicyViolation(false)
    setProgress(0)
    setStep('generating')
  }

  const handleTryAgain = () => {
    setResultOptions([])
    setSelectedIndex(null)
    setStep('input')
  }

  const handleUseThisDesign = () => {
    if (selectedIndex === null) return
    setStep('confirm')
  }

  // Takes the selected variation as the new starting photo and goes back to 'input' for a
  // fresh prompt describing further changes — iterative refinement instead of starting over.
  // `selectedDesign` (parent-library lineage, if any) is deliberately left as-is: the result
  // is still ultimately derived from that same original design, just one more AI pass deep.
  const handleRework = () => {
    if (selectedIndex === null) return
    const chosen = resultOptions[selectedIndex]
    const file = base64ToFile(chosen, 'co-created.png')
    setSource({ file, previewUrl: `data:image/png;base64,${chosen}` })
    setPrompt('')
    setResultOptions([])
    setSelectedIndex(null)
    setStep('input')
  }

  const handleConfirmYes = () => {
    const chosen = resultOptions[selectedIndex]
    const file = base64ToFile(chosen, 'co-created.png')
    onAccepted(file, `data:image/png;base64,${chosen}`, selectedDesign)
  }

  const handleConfirmNo = () => setStep('review')

  const selectedDataUrl = selectedIndex !== null ? `data:image/png;base64,${resultOptions[selectedIndex]}` : null

  const libraryFilterQuery = libraryQuery.trim().toLowerCase()
  const filteredLibrary = (libraryResults || []).filter(
    (c) => !libraryFilterQuery || (c.title || '').toLowerCase().includes(libraryFilterQuery)
  )

  return (
    <section className="create__section">
      <span className="create__section-label">Co-Create with AI</span>

      {error && (
        <div className="create__error" role="alert">
          {error}
          {errorIsPolicyViolation && <PolicyLink />}
        </div>
      )}

      {step === 'input' && (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleSourceFile}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleSourceFile}
          />

          {source ? (
            <div className="create__thumbs">
              <div className="create__thumb">
                <img src={source.previewUrl} alt="Item to redesign" />
                <button
                  type="button"
                  className="create__thumb-remove"
                  aria-label="Remove photo"
                  onClick={handleRemoveSource}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {selectedDesign && (
                <p className="create__library-selected-note">
                  Based on: {selectedDesign.title || 'Untitled'}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="create__tabs">
                <button
                  type="button"
                  className={`create__tab ${sourceTab === 'upload' ? 'create__tab--active' : ''}`}
                  onClick={() => setSourceTab('upload')}
                >
                  Upload Photo
                </button>
                <button
                  type="button"
                  className={`create__tab ${sourceTab === 'library' ? 'create__tab--active' : ''}`}
                  onClick={() => setSourceTab('library')}
                >
                  Choose from Library
                </button>
              </div>

              {sourceTab === 'upload' ? (
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
              ) : (
                <>
                  <div className="create__library-search">
                    <svg className="create__library-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="search"
                      placeholder="Search designs by title"
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                    />
                  </div>

                  {libraryError && (
                    <div className="create__error" role="alert">
                      {libraryError}
                    </div>
                  )}

                  {libraryLoading ? (
                    <p className="create__library-empty">Loading designs…</p>
                  ) : filteredLibrary.length === 0 ? (
                    <p className="create__library-empty">No designs found.</p>
                  ) : (
                    <div className="create__library-grid">
                      {filteredLibrary.map((craft) => (
                        <button
                          key={craft.id}
                          type="button"
                          className="create__library-card"
                          onClick={() => handlePickLibraryDesign(craft)}
                        >
                          <span className="create__library-thumb">
                            <img src={craft.photos[0]} alt={craft.title || 'Untitled'} loading="lazy" />
                          </span>
                          <span className="create__library-title">{craft.title || 'Untitled'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <label className="field">
            <span className="field__label">Describe the redesign</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. same vase, glossy blue glaze, modern minimalist shape"
            />
          </label>

          <button
            type="button"
            className="create__submit"
            disabled={!source || prompt.trim() === ''}
            onClick={handleGenerate}
          >
            Generate Design
          </button>
        </>
      )}

      {step === 'generating' && (
        <div className="create__cocreate-generating">
          <div className="create__cocreate-spinner" aria-hidden="true" />
          <p>Generating your design… {progress}%</p>
        </div>
      )}

      {step === 'review' && resultOptions.length > 0 && (
        <>
          <p className="create__cocreate-hint">Pick the design you'd like to use:</p>
          <div className="create__cocreate-variations">
            {resultOptions.map((b64, i) => (
              <button
                key={i}
                type="button"
                className={`create__cocreate-variation ${selectedIndex === i ? 'create__cocreate-variation--selected' : ''}`}
                onClick={() => setSelectedIndex(i)}
              >
                <img src={`data:image/png;base64,${b64}`} alt={`Design variation ${i + 1}`} />
                {selectedIndex === i && (
                  <span className="create__cocreate-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="create__cocreate-actions">
            <button
              type="button"
              className="create__submit"
              disabled={selectedIndex === null}
              onClick={handleUseThisDesign}
            >
              Use This Design
            </button>
            <button
              type="button"
              className="create__btn-ghost"
              disabled={selectedIndex === null}
              onClick={handleRework}
            >
              Rework on this design
            </button>
            <button type="button" className="create__btn-ghost" onClick={handleTryAgain}>
              Try Again
            </button>
          </div>
        </>
      )}

      {step === 'confirm' && selectedDataUrl && (
        <div className="create__cocreate-confirm">
          <div className="create__thumbs">
            <div className="create__thumb create__thumb--large">
              <img src={selectedDataUrl} alt="Selected design" />
            </div>
          </div>
          <p>View this design in 3D?</p>
          <div className="create__cocreate-actions">
            <button type="button" className="create__submit" onClick={handleConfirmYes}>
              Yes, generate 3D model
            </button>
            <a
              className="create__btn-ghost"
              href={selectedDataUrl}
              download="co-created.png"
              onClick={handleConfirmNo}
            >
              No, just download the image
            </a>
          </div>
        </div>
      )}
    </section>
  )
}
