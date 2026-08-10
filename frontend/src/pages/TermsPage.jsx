import { Link, useNavigate } from 'react-router-dom'
import './Policy.css'

// Public page (no ProtectedRoute) — general Terms & Conditions of using PATHS, distinct from
// PolicyPage (privacy + AI usage) which it links to rather than duplicating. Linked from
// AppNav's desktop-sidebar secondary nav, AccountPage's footer, and WelcomePage. Reuses
// Policy.css's `.policy` shell — same shape (back+title header, numbered sections) as
// PolicyPage, so no new stylesheet is needed.
export default function TermsPage() {
  const navigate = useNavigate()

  return (
    <div className="policy">
      <header className="policy__header">
        <button type="button" className="policy__back" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="policy__title">Terms &amp; Conditions</h1>
      </header>

      <div className="policy__content">
        <p className="policy__updated">Last updated: 2026-08-10</p>

        <section className="policy__section">
          <h2>1. Acceptance of these terms</h2>
          <p>
            PATHS (Pottery - Art - Technology - Heritage &amp; Sustainability) is a Craft Intelligence
            Platform from Centurion University's Waste to Wealth Lab, built at Future Nexus Labs.
            By creating an account or using PATHS as a guest, you agree to these Terms &amp;
            Conditions and to our{' '}
            <Link to="/policy">Privacy &amp; AI Usage Policy</Link>.
          </p>
        </section>

        <section className="policy__section">
          <h2>2. Who PATHS is for</h2>
          <p>
            PATHS is open to students, artisans, faculty, researchers, and designers who create
            an account, and to guests who browse without one. Guests can search, browse, and view
            crafts in 3D/AR, but cannot upload, generate, redesign, download, or publish — signing
            in is required for those.
          </p>
        </section>

        <section className="policy__section">
          <h2>3. Your account</h2>
          <p>
            You're responsible for the accuracy of the information you provide at signup and for
            keeping your password confidential. Let us know right away if you believe your account
            has been accessed without your permission.
          </p>
        </section>

        <section className="policy__section">
          <h2>4. Your content stays yours</h2>
          <p>
            You keep ownership of every photo, prompt, story, and 3D model you create on PATHS.
            Uploading something to PATHS does not transfer ownership to us — it only lets us store
            it, process it through our AI tools on your request, and display it back to you.
          </p>
          <p>
            A craft you haven't published is visible only to you. Publishing a craft (the
            "Publish" action on its detail page) makes its photos, 3D model, and metadata visible
            to — and downloadable by — anyone using PATHS. You can unpublish or delete a craft you
            own at any time from My Library, which removes it from the public gallery immediately.
          </p>
          <p>
            You're responsible for making sure you have the right to upload what you upload — in
            particular, that a craft photo is genuinely yours to share.
          </p>
        </section>

        <section className="policy__section">
          <h2>5. Acceptable use</h2>
          <p>
            Every photo and prompt you submit to our AI tools is automatically screened, and what
            is and isn't acceptable to submit is covered in detail in our{' '}
            <Link to="/policy">AI Usage Policy</Link> — that policy governs content submitted
            through PATHS, and repeated violations may result in restricted access to our AI
            features. Beyond that, don't use PATHS to impersonate someone else, to interfere with
            the platform's normal operation, or to attempt to access another user's private data.
          </p>
        </section>

        <section className="policy__section">
          <h2>6. AI-generated results</h2>
          <p>
            Digital twins and AI-assisted redesigns are generated automatically and may not always
            be accurate, complete, or exactly what you expected — 3D reconstruction from a single
            photo is inherently an approximation. Review a result before relying on it for
            teaching, research, publication, or remaking a physical object.
          </p>
        </section>

        <section className="policy__section">
          <h2>7. A student &amp; research project, provided as-is</h2>
          <p>
            PATHS is a student/research pilot from Centurion University's Waste to Wealth Lab, not
            a commercial product with a guaranteed uptime or support commitment. Features,
            availability, and this policy may change as the project develops. We do our best to
            keep your crafts and data intact, but PATHS is provided "as is," without warranty of
            any kind, and we aren't liable for loss of data or access arising from its use.
          </p>
        </section>

        <section className="policy__section">
          <h2>8. Our name and mark</h2>
          <p>
            "PATHS," the Wheel Rings mark, and the project's wordmark and tagline are ours. See{' '}
            <Link to="/branding">Branding</Link> for the approved logo files, colors, and usage
            guidelines before reusing them anywhere — including which variant to use, minimum
            size, and clear space.
          </p>
        </section>

        <section className="policy__section">
          <h2>9. Changes to these terms</h2>
          <p>
            If these terms change in a way that affects how PATHS may be used, we'll update this
            page and the "Last updated" date above. Continuing to use PATHS after a change means
            you accept the update.
          </p>
        </section>

        <section className="policy__section">
          <h2>10. Contact</h2>
          <p>
            Questions about these terms? Contact the project maintainers directly, or read more
            about the project on the <Link to="/about">About</Link> page.
          </p>
        </section>
      </div>
    </div>
  )
}
