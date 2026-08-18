import { useState } from 'react'
import { ADMIN_TABLES } from '../data/adminTables'
import AdminTable from '../components/AdminTable.jsx'
import AdminMedia from '../components/AdminMedia.jsx'
import AdminAiStatus from '../components/AdminAiStatus.jsx'
import '../pages/Studio.css'
import './AdminPage.css'

const TABS = [...ADMIN_TABLES.map((t) => ({ key: t.key, label: t.label })), { key: 'media', label: 'Media' }]

// Raw-table CRUD across every public.* table (config-driven via data/adminTables.js and
// the generic AdminTable component) plus a Storage media browser (AdminMedia). Rendered
// inside StudioLayout's <Outlet/> at /studio/database, still gated by AdminRoute
// (profiles.is_super_admin) at the route level in App.jsx — the most privileged section
// of the panel, so it keeps its own dedicated guard rather than the broader StudioRoute
// gate the rest of the panel shares.
export default function AdminPage() {
  const [active, setActive] = useState(TABS[0].key)
  const activeConfig = ADMIN_TABLES.find((t) => t.key === active)

  return (
    <div>
      <h1 className="studio-page__title">Database</h1>
      <p className="studio-page__subtitle">Full read/write access to every table — use with care.</p>

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
