import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { ROLE_LABELS, manageableRoles } from '../roles.js'
import './Studio.css'

// Roster scoped to the signed-in staff member's manageable roles (profiles_select_team
// RLS, supabase/migrations/010_role_hierarchy.sql) — a studio_admin sees/promotes
// customer/artisan/designer/studio_manager, a studio_manager sees/promotes
// customer/artisan/designer. Promoting a customer into artisan/designer/studio_manager
// happens here — this is also where AccountPage's artisan_requested_at self-service
// request (previously only actionable via the full /admin console) finally gets a
// purpose-built resolution UI, flagged inline below.
export default function TeamPage() {
  const { user } = useAuth()
  const managed = manageableRoles(user)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    if (managed.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: dbError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, artisan_requested_at, created_at')
      .in('role', managed)
      .order('full_name', { ascending: true })
    if (dbError) setError(dbError.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managed.join(',')])

  useEffect(() => {
    load()
  }, [load])

  const handleRoleChange = async (person, nextRole) => {
    if (nextRole === person.role) return
    setSavingId(person.id)
    setError('')
    try {
      const { error: updateError } = await supabase.from('profiles').update({ role: nextRole }).eq('id', person.id)
      if (updateError) throw new Error(updateError.message)
      // The row may fall out of `managed` entirely (e.g. promoting someone to
      // studio_manager as a studio_admin removes them from a studio_manager's own view
      // next time they load it) — simplest correct refresh is just reloading the query.
      await load()
    } catch (err) {
      setError(err.message || 'Failed to update role')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <LoadingScreen message="Loading team..." inline />

  return (
    <div>
      <h1 className="studio-page__title">Team</h1>
      <p className="studio-page__subtitle">People you can promote, demote, or reassign.</p>

      {error && (
        <div className="create__error studio-page__error" role="alert">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="studio-empty">Nobody in your managed roles yet.</div>
      ) : (
        <div className="studio-list">
          {rows.map((person) => (
            <div className="studio-row" key={person.id}>
              <div className="studio-row__avatar">{(person.full_name || person.email || '?')[0].toUpperCase()}</div>
              <div className="studio-row__body">
                <span className="studio-row__name">{person.full_name || person.email}</span>
                <span className="studio-row__meta">
                  {person.email}
                  {person.role === 'customer' && person.artisan_requested_at && (
                    <> · applied for Artisan {new Date(person.artisan_requested_at).toLocaleDateString()}</>
                  )}
                </span>
              </div>
              <select
                className="studio-row__role-select"
                value={person.role}
                disabled={savingId === person.id}
                onChange={(e) => handleRoleChange(person, e.target.value)}
              >
                {/* Always includes the person's current role even if it's not itself
                    reassignable-into (defensive; in practice `managed` already covers
                    every role this page's own query can return), so the select never
                    silently shows a value not in its own option list. */}
                {[...new Set([person.role, ...managed])].map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
