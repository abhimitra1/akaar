import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import PathsMark from './PathsMark.jsx'

const NAV_ITEMS = [
  { key: 'home', to: '/', label: 'Home' },
  { key: 'explore', to: '/explore', label: 'Explore' },
  { key: 'create', to: '/create', label: 'Create' },
  { key: 'library', to: '/library', label: 'Library' },
  { key: 'account', to: '/account', label: 'Profile' },
]

// Desktop-sidebar-only, below the primary 5 — not in the mobile tab bar, which has no
// room to spare. Mobile reaches the same pages via AccountPage's footer links instead.
const SECONDARY_NAV_ITEMS = [
  { key: 'commissions', to: '/commissions', label: 'My Commissions' },
  { key: 'about', to: '/about', label: 'About' },
  { key: 'terms', to: '/terms', label: 'Terms & Conditions' },
]

const SECONDARY_ICONS = {
  commissions: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  about: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="11.5" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  terms: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>,
}

// Same icon per nav item in the sidebar and tab bar, except "explore" — the tab-bar
// version has always carried an extra crosshair line (pre-existing, kept as-is rather
// than "fixed" while extracting this out of HomePage.jsx).
const SIDEBAR_ICONS = {
  home: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  explore: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></>,
  create: <><path d="M12 20h9" /><path d="M17 21v-8" /><path d="M5 9h14V5H5v4" /><path d="M12 3v18" /></>,
  library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5L4 5.5A2.5 2.5 0 0 1 6.5 3z" /></>,
  account: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
}

const TAB_ICONS = {
  ...SIDEBAR_ICONS,
  explore: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /><line x1="5" y1="12" x2="19" y2="12" /></>,
}

const HOME_PATH_EXTRA = <polyline points="9 22 9 12 15 12 15 22" />

// Shared app chrome for top-level browse screens (Home/Explore/Library/Account): desktop
// sidebar + mobile top-bar/tab-bar/FAB. Detail/flow screens (Create, Processing, Metadata,
// Craft view) keep their own simpler back+title header instead — matches the existing
// pattern from before this was extracted. Reuses Home.css's `home__*` classes verbatim.
export default function AppNav({ active }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <nav className="home__sidebar">
        <div className="home__sidebar-brand">
          <PathsMark size={48} />
          <span>PATHS</span>
        </div>
        <div className="home__sidebar-tagline">Design Thinking by Thinking Design</div>

        {/* Studio-style "New" CTA, above Home — separate from the plain nav row below
            (which skips 'create' to avoid listing it twice; the mobile tab bar still gets
            the full NAV_ITEMS unchanged, it has its own FAB pattern already). */}
        <Link to="/create" className="home__sidebar-cta">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Create</span>
        </Link>

        <div className="home__sidebar-nav">
          {NAV_ITEMS.filter((item) => item.key !== 'create').map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className={`home__sidebar-item ${active === item.key ? 'home__sidebar-item--active' : ''}`}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {SIDEBAR_ICONS[item.key]}
                {item.key === 'home' && HOME_PATH_EXTRA}
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="home__sidebar-divider" aria-hidden="true" />

        <div className="home__sidebar-nav home__sidebar-nav--secondary">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className={`home__sidebar-item ${active === item.key ? 'home__sidebar-item--active' : ''}`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {SECONDARY_ICONS[item.key]}
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}
          {(user?.is_manager || user?.is_super_admin) && (
            <Link
              to="/manager"
              className={`home__sidebar-item ${active === 'manager' ? 'home__sidebar-item--active' : ''}`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>Manager</span>
            </Link>
          )}
          {user?.is_super_admin && (
            <Link
              to="/admin"
              className={`home__sidebar-item ${active === 'admin' ? 'home__sidebar-item--active' : ''}`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z" />
              </svg>
              <span>Admin</span>
            </Link>
          )}
        </div>

        <div className="home__sidebar-footer">
          Preserving craft heritage, built at{' '}
          <a href="https://sofn.vercel.app/" target="_blank" rel="noopener noreferrer">Future Nexus Labs</a>
          {', '}
          <a href="https://cutm.ac.in" target="_blank" rel="noopener noreferrer">Centurion University. </a>
          <a href="/whitepaper.html" target="_blank" rel="noopener noreferrer">Read Whitepaper</a>
        </div>
      </nav>

      <header className="home__top-bar">
        {/* Spacer matching the search button's size, so the brand stays centered
            now that there's no hamburger button (it never opened anything).
            Hidden on desktop, where the brand is hidden too — see Home.css. */}
        <div className="home__topbar-spacer" aria-hidden="true" />
        <div className="home__brand">
          <PathsMark size={36} />
          <span>PATHS</span>
        </div>
        {/* Was purely decorative (no onClick at all) — ExplorePage already has the real
            search box (title/story text search + craft-type filters), this just gets
            there. */}
        <button className="home__icon-btn" aria-label="Search" onClick={() => navigate('/explore')}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </header>

      <Link to="/create" className="home__fab" aria-label="Create new craft">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>

      <nav className="home__tab-bar">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className={`home__tab-item ${active === item.key ? 'home__tab-item--active' : ''}`}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {TAB_ICONS[item.key]}
              {item.key === 'home' && HOME_PATH_EXTRA}
            </svg>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
