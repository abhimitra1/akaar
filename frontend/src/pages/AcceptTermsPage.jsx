import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Create.css'

// Shown once per account, right after signup (or retroactively to already-signed-up users
// the first time they land here — see ProfileGate.jsx) — blocks every other route until
// profiles.terms_accepted_at is set. Mirrors CompleteProfilePage's shape/styling.
export default function AcceptTermsPage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Belt-and-braces alongside ProfileGate's own check: if a user who has already accepted
  // ever ends up here (stale link, back button, a ProfileGate edge case not yet found),
  // bounce them out immediately rather than showing the form again.
  useEffect(() => {
    if (user?.terms_accepted_at) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!checked || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq('id', user.id)
      if (updateError) throw new Error(updateError.message)

      await refreshProfile()
      navigate('/')
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
          <h1 className="create__title">Before you continue</h1>
        </header>

        {error && (
          <div className="create__error" role="alert">
            {error}
          </div>
        )}

        <form className="create__content" onSubmit={handleSubmit}>
          <p className="create__section-label">
            AKAAR uses AI (InstantMesh for 3D reconstruction, Fooocus for AI-assisted
            redesign) to turn your photos into digital twins. Please review how we handle
            your data and what our AI tools can and can't be used for before continuing.
          </p>

          <section className="create__section">
            <p className="create__terms-summary">
              Every photo and prompt you submit to our AI tools is automatically screened —
              content that isn't craft/art-related, or that's sexual, violent, or otherwise
              inappropriate (including anything involving minors), is rejected and never
              processed. Full details in the{' '}
              <Link to="/policy" target="_blank" rel="noopener noreferrer">
                Privacy Policy &amp; AI Usage Policy
              </Link>
              .
            </p>

            <label className="create__terms-checkbox">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>I have read and accept the Privacy Policy and AI Usage Policy.</span>
            </label>
          </section>

          <button type="submit" className="create__submit" disabled={!checked || submitting}>
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
