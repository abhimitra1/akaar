import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Create.css'

// Matches supabase/schema.sql's profiles.role check constraint, excluding 'visitor' —
// that's the default a fresh row starts with, never a deliberate choice on either
// signup path.
const ROLES = ['student', 'artisan', 'faculty', 'researcher', 'designer']

// Shown once, right after a Google OAuth sign-in creates a profile row via
// handle_new_user() with no role/institution/department — Google doesn't collect those,
// unlike email signup (SignUpPage), which asks for them upfront. ProfileGate routes here
// whenever an authenticated user's profile.role is still the 'visitor' default.
export default function CompleteProfilePage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ role: ROLES[0], institution: '', department: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          role: form.role,
          institution: form.institution || null,
          department: form.department || null,
        })
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
          <h1 className="create__title">Welcome to AKAAR</h1>
        </header>

        {error && (
          <div className="create__error" role="alert">
            {error}
          </div>
        )}

        <form className="create__content" onSubmit={handleSubmit}>
          <p className="create__section-label">Just a couple more details to finish setting up your account.</p>

          <section className="create__section">
            {/* Not wrapped in <label> (iOS Safari picker bug) — see SignUp. */}
            <div className="field">
              <label className="field__label" htmlFor="role">
                Role
              </label>
              <select id="role" name="role" value={form.role} onChange={handleChange}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <label className="field">
              <span className="field__label">Institution</span>
              <input name="institution" value={form.institution} onChange={handleChange} />
            </label>

            <label className="field">
              <span className="field__label">Department</span>
              <input name="department" value={form.department} onChange={handleChange} />
            </label>
          </section>

          <button type="submit" className="create__submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
