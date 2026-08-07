import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './Welcome.css'

export default function WelcomePage() {
  const { loginWithGoogle } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      await loginWithGoogle() // redirects away; no further action needed on success
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome__card">
        <header className="welcome__header">
        <span className="welcome__badge" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 11h14a7 7 0 0 1-14 0z" />
            <path d="M8 11V9a4 4 0 0 1 8 0v2" />
          </svg>
        </span>
        <h1 className="welcome__title">AKAAR</h1>
        <p className="welcome__subtitle">Craft Intelligence Platform</p>
      </header>

      {error && (
        <div className="welcome__error" role="alert">
          {error}
        </div>
      )}

      <div className="welcome__actions">
        <Link to="/signin" className="btn btn--primary">
          Sign in
        </Link>
        <Link to="/signup" className="btn btn--secondary">
          Create account
        </Link>

        <button type="button" className="btn btn--google" onClick={handleGoogle} disabled={googleLoading}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
          </svg>
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <div className="welcome__or" aria-hidden="true">
          <span>or</span>
        </div>

        <Link to="/" className="btn btn--tertiary">
          Continue as guest, browse only
        </Link>
      </div>

      <footer className="welcome__footer">
        By continuing you agree to the AKAAR terms and privacy notice.
      </footer>
      </div>
    </div>
  )
}