import { Link, useNavigate } from 'react-router-dom'
import './Policy.css'

// Public page (no ProtectedRoute) — readable before signing up, linked from SignUpPage and
// AcceptTermsPage, and re-readable anytime from AccountPage. Combines the Privacy Policy and
// AI Usage Policy into one page since, for this app, they're tightly linked: most of what
// there is to say about privacy here is about what happens to a photo/prompt once it's sent
// to InstantMesh/Fooocus.
//
// Written to describe what this codebase actually does (AGENTS.md §5a/§5b/§5c), not generic
// boilerplate — update this if the data flow it describes changes.
export default function PolicyPage() {
  const navigate = useNavigate()

  return (
    <div className="policy">
      <header className="policy__header">
        <button type="button" className="policy__back" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="policy__title">Privacy Policy &amp; AI Usage Policy</h1>
      </header>

      <div className="policy__content">
        <p className="policy__updated">Last updated: 2026-08-08</p>

        <section className="policy__section">
          <h2>1. What we collect</h2>
          <ul>
            <li>Account info you provide at signup: name, email, role, institution, department (or, for Google sign-in, whatever Google shares).</li>
            <li>Photos you upload of your craft objects, and any text prompts you write in Co-Create.</li>
            <li>AI-generated redesign images produced by Co-Create, if you choose to use one.</li>
            <li>The 3D models generated from your photos, and metadata you add (title, material, technique, story, etc.).</li>
            <li>Basic usage records needed to run the app: job status, daily creation counts, timestamps.</li>
          </ul>
        </section>

        <section className="policy__section">
          <h2>2. How we use it</h2>
          <p>
            Your photos and prompts are sent to our AI reconstruction tool (InstantMesh) and our
            AI co-creation tool (Fooocus) to generate a 3D digital twin or a redesigned image, as
            requested by you. Metadata you add is stored so your digital twin can be displayed,
            searched, and — if you choose to publish it — shown in the public gallery.
          </p>
          <p>
            Crafts stay private (visible only to you) until you explicitly publish them. Publishing
            makes the photos, 3D model, and metadata visible to anyone using PATHS.
          </p>
        </section>

        <section className="policy__section">
          <h2>3. Where it's processed and stored</h2>
          <ul>
            <li>Accounts, metadata, and job records: Supabase (hosted Postgres + Auth).</li>
            <li>Photos and 3D models: Supabase Storage.</li>
            <li>3D reconstruction and AI redesign: run on a private GPU workstation, reachable only through an authenticated proxy — never exposed directly to the internet.</li>
            <li>Content moderation: every photo and prompt submitted to either AI tool is sent to OpenAI's Moderation API for an automated safety check before it's processed (see Section 5). This is governed by OpenAI's own API terms.</li>
          </ul>
        </section>

        <section className="policy__section">
          <h2>4. Your control over your data</h2>
          <p>
            You can delete any of your own digital twins at any time from My Library — this removes
            its photos, 3D model, and database record. Account deletion isn't available yet as a
            self-service option; if you'd like your account removed, contact us directly.
          </p>
        </section>

        <section className="policy__section">
          <h2>5. AI Usage Policy — what our AI tools are for</h2>
          <p>
            PATHS's AI tools exist to turn genuine craft and art objects into digital twins, and to
            help you explore AI-assisted redesigns of your own work. They are not a general-purpose
            image generator.
          </p>
          <p><strong>We do not support, and automatically reject, submissions that are:</strong></p>
          <ul>
            <li>Sexually explicit, or otherwise not safe for a general audience.</li>
            <li>Involving minors in any inappropriate context.</li>
            <li>Violent, graphic, hateful, or otherwise clearly harmful or illegal.</li>
            <li>Not a genuine craft/art photo or a craft-redesign prompt (i.e. unrelated to this platform's purpose).</li>
          </ul>
        </section>

        <section className="policy__section">
          <h2>6. How enforcement works</h2>
          <p>
            Every photo you submit for 3D reconstruction, and every photo + prompt you submit to
            Co-Create, is automatically screened by an AI content moderation system before it is
            queued or processed. Flagged submissions are rejected immediately and never reach either
            AI tool. This check happens on our server, not in your browser, so it can't be bypassed
            from the client side.
          </p>
          <p>
            Automated moderation isn't perfect — it can occasionally flag acceptable content or miss
            something it shouldn't. If you believe a submission was rejected in error, contact us.
            You're still responsible for what you submit; repeated violations may result in
            restricted access to PATHS's AI features.
          </p>
        </section>

        <section className="policy__section">
          <h2>7. Questions</h2>
          <p>
            This is a student/research project from Centurion University's Waste to Wealth Lab,
            built at Future Nexus Labs — see <Link to="/about">About</Link> for more. For
            questions about this policy or your data, contact the project maintainers directly.
            For the general rules of using PATHS, see our{' '}
            <Link to="/terms">Terms &amp; Conditions</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
