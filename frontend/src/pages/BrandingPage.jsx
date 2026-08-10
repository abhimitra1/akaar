import { useNavigate } from 'react-router-dom'
import PathsMark from '../components/PathsMark.jsx'
import { downloadSvgAsPng } from '../svgDownload.js'
import './Policy.css'
import './Branding.css'

// Public page (no ProtectedRoute) — brand guidelines + downloadable logo files, same
// public-page pattern as Policy/About/Terms. The mark itself (PathsMark.jsx) and the
// downloadable originals (public/brand/*.svg) come from the Claude Design project "PATHS
// logo directions" (PATHS Logo - Wheel Rings.dc.html) — this page documents that design,
// it doesn't invent a new one.
const ASSETS = [
  {
    key: 'icon',
    title: 'Icon',
    desc: 'The mark on its own — app icon, avatar, favicon, anywhere space is tight.',
    svgPath: '/brand/paths-icon.svg',
    pngName: 'paths-icon.png',
    preview: <PathsMark size={72} />,
    previewBg: 'branding__preview--light',
  },
  {
    key: 'icon-on-dark',
    title: 'Icon — on dark',
    desc: 'Same mark, cream ink, for placing on a dark background of your choosing.',
    svgPath: '/brand/paths-icon-on-dark.svg',
    pngName: 'paths-icon-on-dark.png',
    preview: <PathsMark variant="onDark" size={72} />,
    previewBg: 'branding__preview--dark',
  },
]

export default function BrandingPage() {
  const navigate = useNavigate()

  return (
    <div className="policy">
      <header className="policy__header">
        <button type="button" className="policy__back" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="policy__title">Branding</h1>
      </header>

      <div className="policy__content">
        <section className="branding__hero">
          <PathsMark size={64} />
          <div className="branding__hero-word">PATHS</div>
          <p className="branding__hero-tagline">Design Thinking by Thinking Design</p>
        </section>

        <section className="policy__section">
          <h2>The mark</h2>
          <p>
            The potter's wheel seen from above: a clay core, a thrown ring of terracotta, and
            an outer dashed ring — the 3D scan traced around the object. It's the same loop
            PATHS itself runs: a physical craft, digitized, and handed back.
          </p>
        </section>

        <section className="policy__section">
          <h2>Logo files</h2>
          <p>Download the originals as SVG (crisp at any size) or PNG (512px, for places that need a raster file).</p>

          <div className="branding__grid">
            {ASSETS.map((asset) => (
              <div className="branding__card" key={asset.key}>
                <div className={`branding__preview ${asset.previewBg}`}>{asset.preview}</div>
                <h3 className="branding__card-title">{asset.title}</h3>
                <p className="branding__card-desc">{asset.desc}</p>
                <div className="branding__card-actions">
                  <a className="branding__btn" href={asset.svgPath} download>
                    SVG
                  </a>
                  <button
                    type="button"
                    className="branding__btn"
                    onClick={() => downloadSvgAsPng(asset.svgPath, asset.pngName, 512)}
                  >
                    PNG
                  </button>
                </div>
              </div>
            ))}

            <div className="branding__card branding__card--wide">
              <div className="branding__preview branding__preview--light branding__preview--wide">
                <img src="/brand/paths-lockup.svg" alt="PATHS horizontal lockup" height="60" />
              </div>
              <h3 className="branding__card-title">Horizontal lockup</h3>
              <p className="branding__card-desc">Icon + wordmark + tagline, for headers and letterheads.</p>
              <div className="branding__card-actions">
                <a className="branding__btn" href="/brand/paths-lockup.svg" download>
                  SVG
                </a>
                <button
                  type="button"
                  className="branding__btn"
                  onClick={() => downloadSvgAsPng('/brand/paths-lockup.svg', 'paths-lockup.png', 1200)}
                >
                  PNG
                </button>
              </div>
            </div>

            <div className="branding__card branding__card--wide">
              <div className="branding__preview branding__preview--dark branding__preview--wide">
                <img src="/brand/paths-mark-on-dark.svg" alt="PATHS mark on dark chip" height="70" />
              </div>
              <h3 className="branding__card-title">On dark</h3>
              <p className="branding__card-desc">Icon + wordmark on the mark's own ink tile.</p>
              <div className="branding__card-actions">
                <a className="branding__btn" href="/brand/paths-mark-on-dark.svg" download>
                  SVG
                </a>
                <button
                  type="button"
                  className="branding__btn"
                  onClick={() => downloadSvgAsPng('/brand/paths-mark-on-dark.svg', 'paths-mark-on-dark.png', 1200)}
                >
                  PNG
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="policy__section">
          <h2>Color</h2>
          <div className="branding__swatches">
            <div className="branding__swatch">
              <span className="branding__swatch-color" style={{ background: '#C1662E' }} />
              <span className="branding__swatch-label">Terracotta ring<br /><code>#C1662E</code></span>
            </div>
            <div className="branding__swatch">
              <span className="branding__swatch-color" style={{ background: '#2A241F' }} />
              <span className="branding__swatch-label">Ink<br /><code>#2A241F</code></span>
            </div>
            <div className="branding__swatch">
              <span className="branding__swatch-color" style={{ background: '#F6EFE4', border: '1px solid var(--outline-cream)' }} />
              <span className="branding__swatch-label">Cream<br /><code>#F6EFE4</code></span>
            </div>
            <div className="branding__swatch">
              <span className="branding__swatch-color" style={{ background: '#8A7A63' }} />
              <span className="branding__swatch-label">Taupe<br /><code>#8A7A63</code></span>
            </div>
            <div className="branding__swatch">
              <span className="branding__swatch-color" style={{ background: '#C99A3C' }} />
              <span className="branding__swatch-label">Gold accent<br /><code>#C99A3C</code></span>
            </div>
          </div>
          <p className="branding__note">
            The ring's terracotta is a warmer, lighter shade than the app's own UI accent
            (<code>#974400</code>) — the mark keeps its own designed color rather than being
            retinted to match buttons/links elsewhere in the app.
          </p>
        </section>

        <section className="policy__section">
          <h2>Typography</h2>
          <p className="branding__type-sample" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '28px' }}>
            Space Grotesk
          </p>
          <p className="branding__type-desc">Wordmark, headings, anywhere the brand name appears.</p>
          <p className="branding__type-sample" style={{ fontFamily: "'Spectral', serif", fontStyle: 'italic', fontSize: '20px' }}>
            Spectral, italic
          </p>
          <p className="branding__type-desc">Taglines and quiet supporting lines — never body copy or UI text.</p>
        </section>

        <section className="policy__section">
          <h2>Using the mark</h2>
          <ul>
            <li>Keep clear space around the mark of at least half its own width on every side.</li>
            <li>Don't recolor the terracotta ring — it's the one constant across every variant.</li>
            <li>Don't stretch the mark; it's a circle, so any non-uniform scaling shows immediately.</li>
            <li>Below about 24px, use the Icon file as-is — don't try to add the dashed detail back in by hand.</li>
            <li>Use the "on dark" variant on dark backgrounds rather than the ink version at reduced opacity.</li>
          </ul>
        </section>

        <section className="policy__section">
          <h2>Full name &amp; tagline</h2>
          <p>
            <strong>PATHS</strong> — Pottery - Art - Technology - Heritage &amp; Sustainability.
            <br />
            Tagline: <em>Design Thinking by Thinking Design.</em>
          </p>
        </section>
      </div>
    </div>
  )
}
