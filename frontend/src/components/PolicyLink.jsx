import { Link } from 'react-router-dom'

// Appended to a content-moderation rejection message (CreatePage.jsx, CoCreatePanel.jsx,
// ProcessingPage.jsx — all three detect a 422/policy-violation independently, see each for
// how) — an actual clickable link to the policy, not a raw "/policy" string baked into the
// server-side message. `.policy-link` (index.css) inherits `color: currentColor`, so it
// automatically matches whichever error-text color it's rendered inside.
export default function PolicyLink() {
  return (
    <Link to="/policy" className="policy-link">
      Read the AI Usage Policy
    </Link>
  )
}
