import './LoadingScreen.css'

// Reusable full-page loading state: a CSS-rotating ring spinner over the surface
// background + contextual muted text. Replaces plain-text "Loading..." states.
export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-screen__spinner" aria-hidden="true" />
      <p className="loading-screen__text">{message}</p>
    </div>
  )
}