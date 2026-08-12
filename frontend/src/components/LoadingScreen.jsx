import './LoadingScreen.css'

// Reusable loading state: a CSS-rotating ring spinner + contextual muted text.
// Full-page by default (over the surface background); pass `inline` to drop it into a
// content pane instead (e.g. next to a persistent sidebar) without forcing 100vh.
export default function LoadingScreen({ message = 'Loading...', inline = false }) {
  return (
    <div className={`loading-screen${inline ? ' loading-screen--inline' : ''}`} role="status" aria-live="polite">
      <div className="loading-screen__spinner" aria-hidden="true" />
      <p className="loading-screen__text">{message}</p>
    </div>
  )
}