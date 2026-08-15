import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ADMIN_TABLES } from '../data/adminTables'
import AdminTable from '../components/AdminTable.jsx'
import AdminMedia from '../components/AdminMedia.jsx'
import AdminAiStatus from '../components/AdminAiStatus.jsx'
import './AdminPage.css'

const TABS = [...ADMIN_TABLES.map((t) => ({ key: t.key, label: t.label })), { key: 'media', label: 'Media' }]

// Super-admin console: full CRUD on every public.* table (via the generic AdminTable,
// config-driven from data/adminTables.js) plus a Storage media browser (AdminMedia —
// needs the Storage API, not a plain table, so it isn't config-driven the same way).
// Gated behind AdminRoute (profiles.is_super_admin), not just being signed in.
export default function AdminPage() {
  const navigate = useNavigate()
  const [active, setActive] = useState(TABS[0].key)
  const activeConfig = ADMIN_TABLES.find((t) => t.key === active)

  return (
    <div className="admin">
      <header className="admin__header">
        <button type="button" className="admin__back" aria-label="Back" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="admin__title">Admin</h1>
      </header>

      <div className="admin__tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`admin__tab ${active === t.key ? 'admin__tab--active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin__content">
        {active === 'jobs' && <AdminAiStatus />}
        {active === 'media' ? <AdminMedia /> : activeConfig && <AdminTable key={activeConfig.key} config={activeConfig} />}
      </div>
    </div>
  )
}
