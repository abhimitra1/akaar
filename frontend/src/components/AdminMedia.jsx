import { useCallback, useEffect, useState } from 'react'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import './AdminTable.css'
import './AdminMedia.css'

const PAGE_SIZE = 30
// Safety cap on the recursive walk below — this app's bucket is small (a few dozen
// crafts), but caps the request count if it ever isn't.
const MAX_FILES = 3000

const FILETYPE_FILTERS = [
  { key: 'all', label: 'All files' },
  { key: 'image', label: 'Images' },
  { key: 'model', label: '3D models' },
  { key: 'other', label: 'Other' },
]

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i
const MODEL_EXT = /\.(glb|gltf|usdz)$/i

function classify(name) {
  if (IMAGE_EXT.test(name)) return 'image'
  if (MODEL_EXT.test(name)) return 'model'
  return 'other'
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Every object lives at `{ownerId}/{craftId}/...` (see reconstruction.js's photoPath/
// modelPath) — reading the owner back out of the path avoids a separate lookup.
function ownerFromPath(path) {
  return path.split('/')[0] || null
}

// Recursively walks the bucket via the Storage list() API (folder by folder — Storage
// has no single "list everything" call) rather than querying storage.objects directly:
// that table lives in the `storage` schema, which isn't in this Supabase project's
// exposed-schema list by default, so a plain `supabase.schema('storage').from('objects')`
// 400s with "Invalid schema: storage" regardless of RLS. list() is the supported path and
// needs no such project setting. Folders come back from list() as entries with id: null.
async function listAllFiles(prefix, out) {
  if (out.length >= MAX_FILES) return
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, { limit: 1000 })
  if (error) throw new Error(error.message)
  for (const entry of data || []) {
    if (out.length >= MAX_FILES) return
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id === null) {
      await listAllFiles(path, out)
    } else {
      out.push({ ...entry, path })
    }
  }
}

// Admin's "Media" tab: browses every file in the Storage bucket across every user's
// folder. Delete goes through the Storage API (not a plain table delete) so the
// underlying object is actually removed, not just a metadata row.
export default function AdminMedia() {
  const [allFiles, setAllFiles] = useState(null) // null = not loaded yet
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const out = []
      await listAllFiles('', out)
      out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      setAllFiles(out)
    } catch (err) {
      setError(err.message || 'Failed to load media')
      setAllFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(0)
  }, [filter, search])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove([deleteTarget.path])
      if (removeError) throw new Error(removeError.message)
      setDeleteTarget(null)
      load()
    } catch (err) {
      setError(err.message || 'Delete failed')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const filtered = (allFiles || []).filter((f) => {
    if (filter !== 'all' && classify(f.name) !== filter) return false
    if (search.trim() && !f.path.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const publicUrl = (path) => supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl

  return (
    <div className="admin-table">
      <div className="admin-table__toolbar">
        <input
          type="search"
          className="admin-table__search"
          placeholder="Search by file path…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="admin-media__filters">
          {FILETYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`admin-media__filter ${filter === f.key ? 'admin-media__filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="admin-table__count">{total} file{total === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="admin-table__error">{error}</div>}

      {loading ? (
        <div className="admin-table__empty">Loading…</div>
      ) : pageRows.length === 0 ? (
        <div className="admin-table__empty">No files.</div>
      ) : (
        <div className="admin-media__grid">
          {pageRows.map((row) => {
            const kind = classify(row.name)
            return (
              <div className="admin-media__card" key={row.path}>
                <div className="admin-media__preview">
                  {kind === 'image' ? (
                    <img src={publicUrl(row.path)} alt={row.name} loading="lazy" />
                  ) : (
                    <span className="admin-media__kind-badge">{kind === 'model' ? '3D' : 'FILE'}</span>
                  )}
                </div>
                <div className="admin-media__meta">
                  <div className="admin-media__name" title={row.path}>{row.name}</div>
                  <div className="admin-media__sub">
                    {formatBytes(row.metadata?.size)}
                    {row.created_at ? ` · ${new Date(row.created_at).toLocaleDateString()}` : ''}
                  </div>
                  <div className="admin-media__sub admin-media__owner" title={row.path}>
                    Owner: {ownerFromPath(row.path)?.slice(0, 8) || 'unknown'}…
                  </div>
                </div>
                <div className="admin-media__actions">
                  <a href={publicUrl(row.path)} target="_blank" rel="noopener noreferrer" className="admin-table__btn">
                    View
                  </a>
                  <button
                    type="button"
                    className="admin-table__btn admin-table__btn--danger"
                    onClick={() => setDeleteTarget(row)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this file?"
        message={deleteTarget ? `${deleteTarget.path} will be permanently removed from storage.` : ''}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
