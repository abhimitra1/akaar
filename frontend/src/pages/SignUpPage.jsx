import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './SignUp.css'

// Matches models.py User.role enum (excluding "visitor" = guest).
const ROLES = ['student', 'artisan', 'faculty', 'researcher', 'designer']

export default function SignUpPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: ROLES[0],
    institution: '',
    department: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signup(form)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signup">
      <div className="signup__card">
        <header className="signup__header">
          <button
            type="button"
            className="signup__back"
            onClick={() => navigate(-1)}
            aria-label="Back"
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
          <h1 className="signup__title">Create account</h1>
        </header>

        {error && (
          <div className="signup__error" role="alert">
            {error}
          </div>
        )}

        <form className="signup__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Full name</span>
            <input name="full_name" value={form.full_name} onChange={handleChange} required />
          </label>

          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
          </label>

          {/* Role is NOT wrapped in a <label> — iOS Safari fails to open the native picker
              for selects nested inside labels; use htmlFor/id instead. */}
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

          <button type="submit" className="signup__submit" disabled={loading}>
            {loading ? 'Sending…' : 'Create account'}
          </button>
        </form>

        <footer className="signup__footer">
          <Link to="/signin">Already have an account? Sign in</Link>
        </footer>
      </div>
    </div>
  )
}