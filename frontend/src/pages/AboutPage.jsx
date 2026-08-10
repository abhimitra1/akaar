import { Link, useNavigate } from 'react-router-dom'
import './Policy.css'
import './About.css'

// Public page (no ProtectedRoute) — the project's story, mission, and credits. Linked from
// AppNav's desktop-sidebar secondary nav, and from AccountPage's footer for mobile parity
// (mobile has no sidebar). Reuses Policy.css's `.policy` shell (back+title header, article
// body) since the content shape — a scrollable informational page — is identical; About.css
// adds only the hero/credits bits Policy doesn't need.
export default function AboutPage() {
  const navigate = useNavigate()

  return (
    <div className="policy">
      <header className="policy__header">
        <button type="button" className="policy__back" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="policy__title">About PATHS</h1>
      </header>

      <div className="policy__content">
        <section className="about__hero">
          <p className="about__tagline">Design Thinking by Thinking Design</p>
          <p className="about__fullname">Pottery - Art - Technology - Heritage &amp; Sustainability</p>
        </section>

        <section className="policy__section">
          <h2>Why PATHS exists</h2>
          <p>
            Every craft object carries knowledge that took generations to shape — the hand's
            memory for a curve, the eye's judgement of a glaze, the patience to fire a form until
            it holds. Most of that knowledge is never written down. It lives in an artisan's
            hands, and it is genuinely at risk of being lost between generations.
          </p>
          <p>
            PATHS is a Physical–Digital–Physical (PDP) Craft Intelligence Platform from Centurion
            University's Waste to Wealth Lab. It exists to capture that knowledge before it's
            lost: a physical craft object becomes a Digital Twin — a 3D model carrying its story,
            materials, and technique — that can be studied, redesigned, and shared, without ever
            replacing the artisan who made it.
          </p>
        </section>

        <section className="policy__section">
          <h2>How the loop works</h2>
          <p>
            Photograph a craft → AI reconstructs it into a 3D digital twin → its maker (or a
            student, researcher, or fellow artisan) adds the story behind it → the design can be
            explored, redesigned with AI, or downloaded → the improved design is remade as a real
            physical object. Nothing about the original is overwritten — every AI-assisted
            redesign keeps a visible link back to what it was based on, so the lineage of an idea
            is never lost.
          </p>
        </section>

        <section className="policy__section">
          <h2>What we stand for</h2>
          <ul>
            <li>Preserve traditional craft knowledge as a searchable, living archive — not a museum piece.</li>
            <li>Support AI-assisted redesign that starts from tradition, rather than ignoring it.</li>
            <li>Give artisans and students a shared portfolio and clear, lasting credit for their work.</li>
            <li>Turn craft-making into hands-on, experiential learning.</li>
            <li>Grow one craft at a time — pottery first, then bamboo, textiles, wood, metal, terracotta, and beyond.</li>
          </ul>
        </section>

        <section className="policy__section">
          <h2>Developed at</h2>
          <div className="about__credits">
            <div className="about__credit-row">
              <a
                className="about__credit-link"
                href="https://sofn.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Future Nexus Labs
              </a>
              <span className="about__credit-desc">Design &amp; engineering studio</span>
            </div>
            <div className="about__credit-row">
              <a
                className="about__credit-link"
                href="https://cutm.ac.in"
                target="_blank"
                rel="noopener noreferrer"
              >
                Centurion University
              </a>
              <span className="about__credit-desc">Academic home of the Waste to Wealth Lab</span>
            </div>
          </div>
        </section>

        <section className="policy__section">
          <h2>Questions</h2>
          <p>
            Curious how your data is handled, or what our AI tools are for? Read the{' '}
            <Link to="/policy">Privacy &amp; AI Usage Policy</Link>. For the rules of using PATHS,
            see our <Link to="/terms">Terms &amp; Conditions</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
