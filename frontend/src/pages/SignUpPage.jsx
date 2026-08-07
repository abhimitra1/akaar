import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './SignUp.css'

// Matches models.py User.role enum (excluding "visitor" = guest).
const ROLES = ['student', 'artisan', 'faculty', 'researcher', 'designer']

export default function SignUpPage() {
  const { signup, loginWithGoogle } = useAuth()
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
  const [googleLoading, setGoogleLoading] = useState(false)

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

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      await loginWithGoogle() // redirects away; CompleteProfilePage collects role/institution/department after
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
      setGoogleLoading(false)
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

          <div className="signup__or" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            type="button"
            className="signup__google"
            onClick={handleGoogle}
            disabled={googleLoading}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
            </svg>
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>
        </form>

        <footer className="signup__footer">
          <Link to="/signin">Already have an account? Sign in</Link>
        </footer>
      </div>
    </div>
  )
}