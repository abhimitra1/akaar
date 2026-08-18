import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import PathsMark from '../components/PathsMark.jsx'
import './Create.css'
import './CraftPage.css'

const CRAFT_TYPES = ['Pottery', 'Terracotta', 'Wood', 'Metal']

// Create flow, step 3+4 of 4 (see AGENTS.md §3 Phase 2): the 3D model already exists
// (Processing finished) — add metadata, then Store/Save persists it to the craft record.
// Doubles as the edit-details screen (linked from CraftPage/LibraryPage for the creator):
// the update-in-place logic is identical either way, only the heading text differs.
export default function MetadataPage() {
  const { craftId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  // Carried from CreatePage/ProcessingPage (see CreatePage.jsx's reworkOrderId comment) —
  // set only when this craft exists because a studio manager, designer, or customer
  // reworked an order's design via Co-Create, rather than a plain new/edited craft.
  // Store/Save below is what actually performs the re-link, once this craft's metadata is
  // complete.
  const reworkOrderId = location.state?.reworkOrderId || null
  const reworkReturnTo = location.state?.reworkReturnTo || null

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modelUrl, setModelUrl] = useState(null)
  const [isEdit, setIsEdit] = useState(false)
  const [form, setForm] = useState({
    title: '',
    craft_type: '',
    material: '',
    technique: '',
    story: '',
    dimensions: '',
    weight: '',
    height_cm: '',
    location: '',
    year: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      const { data, error: dbError } = await supabase
        .from('crafts')
        .select('*')
        .eq('id', craftId)
        .single()
      if (cancelled) return
      if (dbError) {
        setLoadError('Craft not found')
      } else if (data.owner_id !== user.id) {
        // RLS would reject the update anyway — bounce back to the read-only view
        // rather than showing an editable form the visitor can't actually save.
        navigate(`/craft/${craftId}`, { replace: true })
        return
      } else {
        setIsEdit(Boolean(data.title))
        if (data.model_key) {
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.model_key)
          setModelUrl(pub.publicUrl)
        }
        setForm((f) => ({
          ...f,
          title: data.title || '',
          craft_type: data.craft_type || '',
          material: data.material || '',
          technique: data.technique || '',
          story: data.story || '',
          dimensions: data.dimensions || '',
          weight: data.weight != null ? String(data.weight) : '',
          height_cm: data.height_cm != null ? String(data.height_cm) : '',
          location: data.location || '',
          year: data.year != null ? String(data.year) : '',
        }))
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [craftId, user])

  const canSubmit = form.title.trim() !== '' && !submitting

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      const body = { title: form.title.trim() }
      body.craft_type = form.craft_type || null
      body.material = form.material || null
      body.technique = form.technique || null
      body.story = form.story || null
      body.dimensions = form.dimensions || null
      body.weight = form.weight !== '' ? parseFloat(form.weight) : null
      body.height_cm = form.height_cm !== '' ? parseFloat(form.height_cm) : null
      body.location = form.location || null
      body.year = form.year !== '' ? parseInt(form.year, 10) : null

      const { error: updateError } = await supabase.from('crafts').update(body).eq('id', craftId)
      if (updateError) throw new Error(updateError.message)

      if (reworkOrderId) {
        // Re-point the order at this freshly reworked craft and send it back for
        // (another) studio manager look — guard_order_transition() (schema.sql) is what
        // actually allows this exact update, from changes_requested (a customer's or
        // designer's own rework) or pending_manager_review (a manager's own "Rework it
        // here").
        const { error: orderUpdateError } = await supabase
          .from('orders')
          .update({ craft_id: craftId, status: 'pending_manager_review' })
          .eq('id', reworkOrderId)
        if (orderUpdateError) throw new Error(orderUpdateError.message)
        navigate(
          reworkReturnTo === 'manager'
            ? `/studio/orders/${reworkOrderId}`
            : reworkReturnTo === 'designer-queue'
              ? '/studio/designer-queue'
              : `/orders/${reworkOrderId}`
        )
        return
      }

      navigate(`/craft/${craftId}`)
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading..." />
  }

  return (
    <div className="create">
      <div className="create__card">
        <header className="create__header">
          {isEdit && (
            <button
              type="button"
              className="create__back"
              aria-label="Back"
              onClick={() => navigate(`/craft/${craftId}`)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <PathsMark variant="onDark" size={22} className="create__header-mark" />
          <h1 className="create__title">{isEdit ? 'Edit Details' : 'Add Details'}</h1>
        </header>

        {(error || loadError) && (
          <div className="create__error" role="alert">
            {error || loadError}
          </div>
        )}

        {!loadError && (
          <div className="create__content">
            {modelUrl ? (
              <model-viewer
                className="craft__viewer"
                src={modelUrl}
                alt="Generated 3D model"
                camera-controls
                auto-rotate
                style={{ width: '100%', height: '400px' }}
              />
            ) : (
              <div className="craft__no-model">No 3D model yet — it may still be processing.</div>
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

              <label className="field">
                <span className="field__label">Height</span>
                <input
                  name="height_cm"
                  value={form.height_cm}
                  onChange={handleChange}
                  inputMode="decimal"
                  placeholder="cm — optional, used to scale the 3D/AR view to true size"
                />
              </label>

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

            <button type="button" className="create__submit" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Store / Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
