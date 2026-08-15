import { useCallback, useEffect, useState } from 'react'
import { checkHealth } from '../instantMesh.js'
import './AdminTable.css'
import './AdminAiStatus.css'

const SERVICE_LABELS = {
  instantMesh: 'InstantMesh (3D reconstruction)',
  fooocus: 'Fooocus-API (co-create)',
  moderation: 'Moderation service',
}

// Jobs tab's "AI requests" (image_gen/3d_gen rows) all depend on the GPU-box proxy and the
// services behind it — this lets an admin ping it on demand instead of inferring "is it up"
// from whether recent jobs happen to be stuck in `queued`.
export default function AdminAiStatus() {
  const [status, setStatus] = useState(null) // null = never pinged yet
  const [pinging, setPinging] = useState(false)
  const [error, setError] = useState('')

  const ping = useCallback(async () => {
    setPinging(true)
    setError('')
    try {
      const result = await checkHealth()
      setStatus(result)
    } catch (err) {
      setStatus(null)
      setError(err.message || 'Failed to reach the AI proxy')
    } finally {
      setPinging(false)
    }
  }, [])

  useEffect(() => {
    ping()
  }, [ping])

  const overall = error ? 'offline' : status ? (status.online ? 'online' : 'degraded') : 'unknown'
  const overallLabel = { online: 'Online', degraded: 'Degraded', offline: 'Offline', unknown: 'Not checked yet' }[overall]

  return (
    <div className="ai-status">
      <div className="ai-status__header">
        <div className="ai-status__title-row">
          <span className={`ai-status__dot ai-status__dot--${overall}`} />
          <span className="ai-status__title">AI services</span>
          <span className={`ai-status__badge ai-status__badge--${overall}`}>{overallLabel}</span>
        </div>
        <button type="button" className="admin-table__btn admin-table__btn--primary" onClick={ping} disabled={pinging}>
          {pinging ? 'Pinging…' : 'Ping'}
        </button>
      </div>

      {error && <div className="admin-table__error">{error}</div>}

      {status && (
        <div className="ai-status__services">
          {Object.entries(SERVICE_LABELS).map(([key, label]) => {
            const up = status.services?.[key]
            return (
              <div className="ai-status__service" key={key}>
                <span className={`ai-status__dot ai-status__dot--${up ? 'online' : 'offline'}`} />
                <span className="ai-status__service-label">{label}</span>
                <span className="ai-status__service-state">{up ? 'Online' : 'Offline'}</span>
              </div>
            )
          })}
          <div className="ai-status__checked-at">Last checked {new Date(status.checkedAt).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  )
}
