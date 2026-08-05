import { Link } from 'react-router-dom'
import './Welcome.css'

export default function WelcomePage() {
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
        <p className="welcome__subtitle">Every craft has a digital twin</p>
      </header>

      <div className="welcome__actions">
        <Link to="/signin" className="btn btn--primary">
          Sign in
        </Link>
        <Link to="/signup" className="btn btn--secondary">
          Create account
        </Link>

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