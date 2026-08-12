import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import './AdminTable.css'

const PAGE_SIZE = 25

function formatCell(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// List-view cell for one field: resolves `field.lookup` (a related row's label, e.g. a
// craft's owner_id -> its owner's full_name) or `field.optionLabels` (a friendlier name
// for a raw enum value, e.g. 'ai_generated' -> "AI Generated") when present, falling back
// to the raw stored value otherwise. The raw value stays available as a title tooltip
// whenever a lookup label is shown, so the underlying id is never fully hidden.
function formatListCell(field, row, lookupMaps) {
  const raw = row[field.key]
  if (field.lookup) {
    const label = lookupMaps[field.key]?.[raw]
    if (label) return { text: label, title: String(raw) }
    if (raw === null || raw === undefined) return { text: '—' }
    return { text: String(raw) }
  }
  if (field.optionLabels && raw in field.optionLabels) {
    return { text: field.optionLabels[raw] }
  }
  return { text: formatCell(raw) }
}

// Turns a config field's stored value into what its form input should show.
function toFieldInput(field, value) {
  if (field.type === 'json') return JSON.stringify(value ?? (Array.isArray(value) ? [] : {}), null, 2)
  if (field.type === 'boolean') return Boolean(value)
  if (value === null || value === undefined) return ''
  return String(value)
}

// Reverses toFieldInput, converting a form value back to what Postgres expects.
function fromFieldInput(field, raw) {
  if (field.type === 'boolean') return Boolean(raw)
  if (field.type === 'number') return raw === '' ? null : Number(raw)
  if (field.type === 'json') {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    return JSON.parse(trimmed) // caller catches malformed JSON
  }
  return raw === '' ? null : raw
}

// Generic list + create/edit/delete UI for one Postgres table, driven entirely by a
// data/adminTables.js config entry — used by every tab in AdminPage.jsx except Media
// (Storage objects need the Storage API for delete, not a plain table delete, so that
// tab is its own component, AdminMedia.jsx).
export default function AdminTable({ config }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // { [fieldKey]: { [relatedId]: label } } — populated after each row fetch for every
  // field with a `lookup` config (see fields with `.lookup` in data/adminTables.js).
  const [lookupMaps, setLookupMaps] = useState({})

  const [editing, setEditing] = useState(null) // null | 'new' | row object
  const [formValues, setFormValues] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from(config.table)
        .select('*', { count: 'exact' })
        .order(config.orderBy.column, { ascending: config.orderBy.ascending })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      // Client-visible search: ilike OR across the table's own listed text columns.
      // Postgrest's .or() takes one comma-joined filter string, built here per table
      // since each table's searchable columns differ.
      if (search.trim()) {
        const textColumns = config.fields
          .filter((f) => (f.type === 'text' || f.type === 'textarea') && config.listColumns.includes(f.key))
          .map((f) => f.key)
        if (textColumns.length > 0) {
          const term = search.trim().replace(/[%,()]/g, '')
          query = query.or(textColumns.map((c) => `${c}.ilike.%${term}%`).join(','))
        }
      }

      const { data, count, error: fetchError } = await query
      if (fetchError) throw new Error(fetchError.message)
      setRows(data || [])
      setTotal(count ?? 0)
    } catch (err) {
      setError(err.message || 'Failed to load rows')
    } finally {
      setLoading(false)
    }
  }, [config, page, search])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  // Table (and its search) changed out from under us — reset paging.
  useEffect(() => {
    setPage(0)
  }, [config.key])

  // Resolves every `lookup` field's ids on the current page into display labels (e.g. a
  // craft's owner_id -> its owner's full_name). Re-runs whenever the page of rows changes;
  // batches one query per lookup field rather than one per row.
  useEffect(() => {
    const lookupFields = config.fields.filter((f) => f.lookup)
    if (lookupFields.length === 0 || rows.length === 0) {
      setLookupMaps({})
      return
    }
    let cancelled = false
    ;(async () => {
      const next = {}
      for (const field of lookupFields) {
        const ids = [...new Set(rows.map((r) => r[field.key]).filter((v) => v !== null && v !== undefined))]
        if (ids.length === 0) {
          next[field.key] = {}
          continue
        }
        const { data } = await supabase
          .from(field.lookup.table)
          .select(`id, ${field.lookup.labelColumn}`)
          .in('id', ids)
        next[field.key] = Object.fromEntries((data || []).map((r) => [r.id, r[field.lookup.labelColumn]]))
      }
      if (!cancelled) setLookupMaps(next)
    })()
    return () => {
      cancelled = true
    }
  }, [config, rows])

  const openCreate = () => {
    const initial = {}
    for (const f of config.fields) {
      if (f.type === 'readonly' || f.hideOnCreate) continue
      initial[f.key] = toFieldInput(f, f.type === 'boolean' ? false : null)
    }
    setFormValues(initial)
    setFormError('')
    setEditing('new')
  }

  const openEdit = (row) => {
    const initial = {}
    for (const f of config.fields) {
      // createOnly fields (e.g. profiles' password, only meaningful via customCreate)
      // don't correspond to a real column on existing rows — never show them on edit.
      if (f.createOnly) continue
      initial[f.key] = toFieldInput(f, row[f.key])
    }
    setFormValues(initial)
    setFormError('')
    setEditing(row)
  }

  const closeModal = () => {
    setEditing(null)
    setFormError('')
  }

  const handleSave = async () => {
    setFormError('')
    const payload = {}
    try {
      for (const f of config.fields) {
        if (f.type === 'readonly') continue
        // createOnly fields (e.g. profiles' password) only exist at creation time —
        // openEdit never puts them in formValues, and they don't correspond to a real
        // column, so leave them out of an update payload entirely. hideOnCreate is the
        // mirror image (e.g. profiles' role) — never part of the create payload.
        if (f.createOnly && editing !== 'new') continue
        if (f.hideOnCreate && editing === 'new') continue
        payload[f.key] = fromFieldInput(f, formValues[f.key])
      }
    } catch {
      setFormError('One of the JSON fields is not valid JSON.')
      return
    }

    setSaving(true)
    try {
      if (editing === 'new') {
        if (config.customCreate) {
          await config.customCreate(payload)
        } else {
          const { error: insertError } = await supabase.from(config.table).insert(payload)
          if (insertError) throw new Error(insertError.message)
        }
      } else {
        const { error: updateError } = await supabase
          .from(config.table)
          .update(payload)
          .eq(config.primaryKey, editing[config.primaryKey])
        if (updateError) throw new Error(updateError.message)
      }
      closeModal()
      fetchRows()
    } catch (err) {
      setFormError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const { error: deleteError } = await supabase
        .from(config.table)
        .delete()
        .eq(config.primaryKey, deleteTarget[config.primaryKey])
      if (deleteError) throw new Error(deleteError.message)
      setDeleteTarget(null)
      fetchRows()
    } catch (err) {
      setError(err.message || 'Delete failed')
      setDeleteTarget(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const listFields = useMemo(
    () => config.listColumns.map((key) => config.fields.find((f) => f.key === key)).filter(Boolean),
    [config]
  )

  return (
    <div className="admin-table">
      <div className="admin-table__toolbar">
        <input
          type="search"
          className="admin-table__search"
          placeholder={`Search ${config.label.toLowerCase()}…`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
        <span className="admin-table__count">{total} row{total === 1 ? '' : 's'}</span>
        {config.allowInsert && (
          <button type="button" className="admin-table__btn admin-table__btn--primary" onClick={openCreate}>
            + Add
          </button>
        )}
      </div>

      {error && <div className="admin-table__error">{error}</div>}

      <div className="admin-table__scroll">
        <table className="admin-table__grid">
          <thead>
            <tr>
              {listFields.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th className="admin-table__actions-head">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={listFields.length + 1} className="admin-table__empty">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={listFields.length + 1} className="admin-table__empty">No rows.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row[config.primaryKey]}>
                  {listFields.map((f) => {
                    const cell = formatListCell(f, row, lookupMaps)
                    return <td key={f.key} title={cell.title}>{cell.text}</td>
                  })}
                  <td className="admin-table__actions">
                    <button type="button" className="admin-table__btn" onClick={() => openEdit(row)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-table__btn admin-table__btn--danger"
                      onClick={() => setDeleteTarget(row)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-table__pager">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {editing !== null && (
        <div className="admin-table__modal-backdrop" onClick={closeModal}>
          <div className="admin-table__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-table__modal-title">
              {editing === 'new' ? `New ${config.label.slice(0, -1) || config.label}` : `Edit ${config.label.slice(0, -1) || config.label}`}
            </h3>

            {formError && <div className="admin-table__error">{formError}</div>}

            <div className="admin-table__form">
              {config.fields.map((f) => {
                if (f.type === 'readonly') {
                  if (editing === 'new') return null
                  return (
                    <div className="admin-table__field" key={f.key}>
                      <label>{f.label}</label>
                      <div className="admin-table__readonly">{formatCell(editing[f.key])}</div>
                    </div>
                  )
                }
                // e.g. profiles' role/is_super_admin — only meaningful once the row (and
                // its underlying auth.users account, for profiles specifically) exists;
                // set via a follow-up Edit instead of at creation time.
                if (f.hideOnCreate && editing === 'new') return null
                if (f.createOnly && editing !== 'new') return null
                return (
                  <div className="admin-table__field" key={f.key}>
                    <label htmlFor={`f-${f.key}`}>{f.label}</label>
                    {f.type === 'textarea' || f.type === 'json' ? (
                      <textarea
                        id={`f-${f.key}`}
                        rows={f.type === 'json' ? 5 : 3}
                        className={f.type === 'json' ? 'admin-table__mono' : ''}
                        value={formValues[f.key] ?? ''}
                        onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    ) : f.type === 'boolean' ? (
                      <input
                        id={`f-${f.key}`}
                        type="checkbox"
                        checked={Boolean(formValues[f.key])}
                        onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        id={`f-${f.key}`}
                        value={formValues[f.key] ?? ''}
                        onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      >
                        <option value="">—</option>
                        {f.options.map((opt) => (
                          <option key={opt} value={opt}>{f.optionLabels?.[opt] || opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`f-${f.key}`}
                        type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                        autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                        value={formValues[f.key] ?? ''}
                        onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="admin-table__modal-actions">
              <button type="button" className="admin-table__btn" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-table__btn admin-table__btn--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete this ${config.label.toLowerCase().replace(/s$/, '')}?`}
        message="This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
