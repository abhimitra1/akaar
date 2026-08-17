import { FEASIBILITY_CRITERIA, FEASIBILITY_STATUSES, FEASIBILITY_STATUS_LABELS } from '../data/feasibilityChecklist.js'

// Manufacturing-feasibility grid, driven by data/feasibilityChecklist.js — the one place
// this list of criteria is defined, shared between two very different uses of the same
// data: ManagerReviewPage renders this editable (onChange set) to record a decision;
// CommissionDetailPage renders it readOnly so the customer sees exactly what a manager
// flagged, criterion by criterion, instead of just a prose remark.
export default function FeasibilityChecklist({ value, onChange, readOnly = false }) {
  return (
    <div className="commission__checklist">
      {FEASIBILITY_CRITERIA.map((criterion) => {
        const entry = value?.[criterion.key] || { status: 'na', note: '' }
        if (readOnly && entry.status === 'na' && !entry.note) return null
        return (
          <div key={criterion.key} className="commission__checklist-row">
            <div className="commission__checklist-head">
              <span className="commission__checklist-label">{criterion.label}</span>
              <span className="commission__checklist-hint">{criterion.hint}</span>
            </div>

            {readOnly ? (
              <div className="commission__checklist-body">
                <span className={`commission__pill commission__pill--${entry.status}`}>
                  {FEASIBILITY_STATUS_LABELS[entry.status]}
                </span>
                {entry.note && <p className="commission__checklist-note">{entry.note}</p>}
              </div>
            ) : (
              <div className="commission__checklist-body">
                <div className="commission__pill-group" role="radiogroup" aria-label={criterion.label}>
                  {FEASIBILITY_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={entry.status === s}
                      className={`commission__pill commission__pill--select commission__pill--${s} ${
                        entry.status === s ? 'commission__pill--active' : ''
                      }`}
                      onClick={() => onChange(criterion.key, { ...entry, status: s })}
                    >
                      {FEASIBILITY_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="commission__checklist-input"
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
