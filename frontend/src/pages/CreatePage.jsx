import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Create.css'

const MAX_PHOTOS = 12 // AGENTS.md app flow: max 12 photos per craft
const CRAFT_TYPES = ['Pottery', 'Bamboo', 'Textiles', 'Wood', 'Metal', 'Terracotta', 'Recycled', 'Other']

export default function CreatePage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const modelInputRef = useRef(null)

  const [mode, setMode] = useState('photos') // 'photos' | 'model'
  const [photos, setPhotos] = useState([]) // [{ file, previewUrl }]
  const [modelFile, setModelFile] = useState(null) // single .glb/.obj/.usdz File
  const [form, setForm] = useState({
    title: '',
    craft_type: '',
    material: '',
    technique: '',
    story: '',
    dimensions: '',
    weight: '',
    location: '',
    year: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canSubmit =
    form.title.trim() !== '' &&
    !submitting &&
    (mode === 'photos' ? photos.length > 0 : modelFile !== null)

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || [])
    const remaining = MAX_PHOTOS - photos.length
    const added = files.slice(0, remaining).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [...prev, ...added])
    e.target.value = '' // allow re-selecting the same file
  }

  const removePhoto = (index) => {
    const target = photos[index]
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleModelFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
    if (!['.glb', '.obj', '.usdz'].includes(ext)) {
      setError('Unsupported model type — allowed: .glb, .obj, .usdz')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('Model file too large (max 100 MB)')
      return
    }
    setError('')
    setModelFile(file)
  }

  const buildCraftBody = () => {
    const body = { title: form.title.trim() }
    if (form.craft_type) body.craft_type = form.craft_type
    if (form.material) body.material = form.material
    if (form.technique) body.technique = form.technique
    if (form.story) body.story = form.story
    if (form.dimensions) body.dimensions = form.dimensions
    if (form.weight !== '') body.weight = parseFloat(form.weight)
    if (form.location) body.location = form.location
    if (form.year !== '') body.year = parseInt(form.year, 10)
    return body
  }

  const handleSubmit = async () => {
    if (mode !== 'photos' || !canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      const authHeaders = { Authorization: `Bearer ${accessToken}` }

      // a. Create the craft record -> craft_id
      const body = buildCraftBody()

      const createRes = await fetch(`${API_BASE_URL}/api/crafts`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const createData = await createRes.json().catch(() => ({}))
      if (!createRes.ok) throw new Error(createData.detail || 'Failed to create craft')
      const craftId = createData.id

      // b. Upload the selected photos
      const fd = new FormData()
      photos.forEach((p) => fd.append('files', p.file, p.file.name))
      const uploadRes = await fetch(`${API_BASE_URL}/api/crafts/${craftId}/photos`, {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      })
      const uploadData = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok) throw new Error(uploadData.detail || 'Failed to upload photos')

      // c. Enqueue the reconstruction job -> job_id
      const genRes = await fetch(`${API_BASE_URL}/api/crafts/${craftId}/generate`, {
        method: 'POST',
        headers: authHeaders,
      })
      const genData = await genRes.json().catch(() => ({}))
      if (!genRes.ok) throw new Error(genData.detail || 'Failed to start generation')

      // d. Go to the (placeholder) processing screen
      navigate(`/processing/${genData.job_id}`)
    } catch (err) {
      // e. On failure: show error and stay on this page
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSave = async () => {
    if (mode !== 'model' || !canSubmit || !modelFile) return
    setError('')
    setSubmitting(true)
    try {
      const authHeaders = { Authorization: `Bearer ${accessToken}` }
      const body = buildCraftBody()

      // a. Create the craft record -> craft_id
      const createRes = await fetch(`${API_BASE_URL}/api/crafts`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const createData = await createRes.json().catch(() => ({}))
      if (!createRes.ok) throw new Error(createData.detail || 'Failed to create craft')
      const craftId = createData.id

      // b. Upload the model file directly (no AI job — completed immediately)
      const fd = new FormData()
      fd.append('file', modelFile, modelFile.name)
      const uploadRes = await fetch(`${API_BASE_URL}/api/crafts/${craftId}/model`, {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      })
      const uploadData = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok) throw new Error(uploadData.detail || 'Failed to upload model')

      // c. Skip Processing entirely — the craft is ready now.
      navigate(`/craft/${craftId}`)
    } catch (err) {
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
        </header>

        {error && (
          <div className="create__error" role="alert">
            {error}
          </div>
        )}

        <div className="create__content">
          <div className="create__tabs" role="tablist" aria-label="Create method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'photos'}
              className={`create__tab${mode === 'photos' ? ' create__tab--active' : ''}`}
              onClick={() => setMode('photos')}
            >
              Generate from Photos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'model'}
              className={`create__tab${mode === 'model' ? ' create__tab--active' : ''}`}
              onClick={() => setMode('model')}
            >
              Upload Existing Model
            </button>
          </div>

          {mode === 'photos' && (
          <section className="create__section">
            <div className="create__photo-header">
              <span className="create__section-label">Photos</span>
              <span className="create__counter">
                {photos.length} / {MAX_PHOTOS} photos
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFiles}
            />

            {photos.length > 0 ? (
              <div className="create__thumbs">
                {photos.map((p, i) => (
                  <div key={i} className="create__thumb">
                    <img src={p.previewUrl} alt={`photo-${i + 1}`} />
                    <button
                      type="button"
                      className="create__thumb-remove"
                      aria-label="Remove photo"
                      onClick={() => removePhoto(i)}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    className="create__thumb-add"
                    aria-label="Add more photos"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
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
                <span className="create__upload-text">Add photos</span>
                <span className="create__upload-sub">Tap to add up to {MAX_PHOTOS} photos</span>
              </button>
            )}
          </section>
          )}

          {mode === 'model' && (
          <section className="create__section">
            <div className="create__photo-header">
              <span className="create__section-label">Model file</span>
            </div>

            <input
              ref={modelInputRef}
              type="file"
              accept=".glb,.obj,.usdz"
              hidden
              onChange={handleModelFile}
            />

            {modelFile ? (
              <div className="create__model-file">
                <span className="create__model-name" title={modelFile.name}>
                  {modelFile.name}
                </span>
                <button
                  type="button"
                  className="create__model-remove"
                  onClick={() => setModelFile(null)}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="create__upload"
                onClick={() => modelInputRef.current?.click()}
              >
                <svg className="create__upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12" />
                  <path d="M8 8l4-4 4 4" />
                  <rect x="4" y="14" width="16" height="7" rx="2" />
                </svg>
                <span className="create__upload-text">Upload model file</span>
                <span className="create__upload-sub">.glb, .obj, or .usdz · up to 100 MB</span>
              </button>
            )}
          </section>
          )}

          <section className="create__section">
            <span className="create__section-label">Details</span>

            <label className="field">
              <span className="field__label">Title *</span>
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Hand-thrown terracotta vase"
              />
            </label>

            {/* Not wrapped in <label> (iOS Safari picker bug) — see SignUp. */}
            <div className="field">
              <span className="field__label">Craft type</span>
              <select name="craft_type" value={form.craft_type} onChange={handleChange}>
                <option value="">Select…</option>
                {CRAFT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <label className="field">
              <span className="field__label">Material</span>
              <input name="material" value={form.material} onChange={handleChange} />
            </label>

            <label className="field">
              <span className="field__label">Technique</span>
              <input name="technique" value={form.technique} onChange={handleChange} />
            </label>

            <label className="field">
              <span className="field__label">Story / description</span>
              <textarea name="story" value={form.story} onChange={handleChange} rows={3} />
            </label>

            <div className="create__row">
              <label className="field">
                <span className="field__label">Dimensions</span>
                <input name="dimensions" value={form.dimensions} onChange={handleChange} />
              </label>

              <label className="field">
                <span className="field__label">Weight</span>
                <input
                  name="weight"
                  value={form.weight}
                  onChange={handleChange}
                  inputMode="decimal"
                  placeholder="kg"
                />
              </label>
            </div>

            <div className="create__row">
              <label className="field">
                <span className="field__label">Location</span>
                <input name="location" value={form.location} onChange={handleChange} />
              </label>

              <label className="field">
                <span className="field__label">Year</span>
                <input
                  name="year"
                  value={form.year}
                  onChange={handleChange}
                  inputMode="numeric"
                  placeholder="yyyy"
                />
              </label>
            </div>
          </section>

          <button
            type="button"
            className="create__submit"
            disabled={!canSubmit}
            onClick={mode === 'photos' ? handleSubmit : handleSave}
          >
            {submitting
              ? mode === 'photos'
                ? 'Creating…'
                : 'Saving…'
              : mode === 'photos'
                ? 'Generate 3D Model'
                : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}