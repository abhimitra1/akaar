import { FEASIBILITY_CRITERIA, FEASIBILITY_STATUSES, FEASIBILITY_STATUS_LABELS } from '../data/feasibilityChecklist.js'

// Manufacturing-feasibility grid, driven by data/feasibilityChecklist.js — the one place
// this list of criteria is defined, shared between two very different uses of the same
// data: ManagerReviewPage renders this editable (onChange set) to record a decision;
// OrderDetailPage renders it readOnly so the customer sees exactly what a studio manager
// flagged, criterion by criterion, instead of just a prose remark.
export default function FeasibilityChecklist({ value, onChange, readOnly = false }) {
  return (
    <div className="order__checklist">
      {FEASIBILITY_CRITERIA.map((criterion) => {
        const entry = value?.[criterion.key] || { status: 'na', note: '' }
        if (readOnly && entry.status === 'na' && !entry.note) return null
        return (
          <div key={criterion.key} className="order__checklist-row">
            <div className="order__checklist-head">
              <span className="order__checklist-label">{criterion.label}</span>
              <span className="order__checklist-hint">{criterion.hint}</span>
            </div>

            {readOnly ? (
              <div className="order__checklist-body">
                <span className={`order__pill order__pill--${entry.status}`}>
                  {FEASIBILITY_STATUS_LABELS[entry.status]}
                </span>
                {entry.note && <p className="order__checklist-note">{entry.note}</p>}
              </div>
            ) : (
              <div className="order__checklist-body">
                <div className="order__pill-group" role="radiogroup" aria-label={criterion.label}>
                  {FEASIBILITY_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={entry.status === s}
                      className={`order__pill order__pill--select order__pill--${s} ${
                        entry.status === s ? 'order__pill--active' : ''
                      }`}
                      onClick={() => onChange(criterion.key, { ...entry, status: s })}
                    >
                      {FEASIBILITY_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="order__checklist-input"
                  placeholder="Note (optional)"
                  value={entry.note}
                  onChange={(e) => onChange(criterion.key, { ...entry, note: e.target.value })}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
