import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import PathsMark from './PathsMark.jsx'
import { roleLabel, isStudioManagerOrAbove, isDesigner } from '../roles.js'
import './StudioLayout.css'

// One section per sidebar entry — `show` decides visibility per signed-in user, same
// "hide what you can't reach" convention as AppNav's conditional Admin link. This is UX
// only: the matching route below is still wrapped in its own guard (ManagerRoute/
// TeamRoute/DesignerRoute/AdminRoute), which is the real boundary — RLS on top of that is
// the actual one, per this app's "frontend gate is just UX" rule.
const SECTIONS = [
  {
    key: 'overview',
    to: '/studio',
    end: true,
    label: 'Overview',
    show: () => true,
    icon: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  },
  {
    key: 'orders',
    to: '/studio/orders',
    label: 'Orders',
    show: isStudioManagerOrAbove,
    icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  },
  {
    key: 'designer-queue',
    to: '/studio/designer-queue',
    label: 'My Assignments',
    show: isDesigner,
    icon: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  },
  {
    key: 'team',
    to: '/studio/team',
    label: 'Team',
    show: isStudioManagerOrAbove,
    icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  },
  {
    key: 'database',
    to: '/studio/database',
    label: 'Database',
    show: (user) => Boolean(user?.is_super_admin),
    icon: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>,
  },
]

// Persistent-sidebar shell for every staff-facing surface (order review, team roster,
// designer assignments, raw-table admin) — replaces the previous approach of scattering
// these behind secondary links in the consumer-facing AppNav. Section content renders via
// the nested <Outlet/>; each section is its own page component (ManagerPage, TeamPage,
// etc.) with no header of its own — this shell's topbar/sidebar is the only chrome, same
// role a "back to home" header played on single-purpose pages.
export default function StudioLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const items = SECTIONS.filter((s) => s.show(user))

  const handleExit = () => navigate('/')
  const handleSignOut = async () => {
    await logout()
    navigate('/welcome')
  }

  return (
    <div className="studio">
      <aside className={`studio__sidebar ${mobileOpen ? 'studio__sidebar--open' : ''}`}>
        <button type="button" className="studio__brand" onClick={handleExit}>
          <PathsMark size={32} />
          <span className="studio__brand-text">
            <span className="studio__brand-name">PATHS</span>
            <span className="studio__brand-tag">Studio</span>
          </span>
        </button>

        <nav className="studio__nav">
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `studio__nav-item ${isActive ? 'studio__nav-item--active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="studio__sidebar-footer">
          <div className="studio__user">
            <div className="studio__user-avatar">{(user?.full_name || user?.email || '?')[0].toUpperCase()}</div>
            <div className="studio__user-info">
              <span className="studio__user-name">{user?.full_name || user?.email}</span>
              <span className="studio__user-role">{roleLabel(user)}</span>
            </div>
          </div>
          <button type="button" className="studio__footer-link" onClick={handleExit}>
            Exit to app
          </button>
          <button type="button" className="studio__footer-link studio__footer-link--danger" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="studio__scrim" onClick={() => setMobileOpen(false)} />}

      <div className="studio__main">
        <header className="studio__topbar">
          <button type="button" className="studio__menu-btn" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="studio__topbar-brand">PATHS Studio</span>
        </header>

        <main className="studio__content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
