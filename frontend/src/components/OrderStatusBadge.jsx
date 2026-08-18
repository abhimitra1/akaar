// Shared status pill for commissions.status — used by ManagerPage/ManagerReviewPage
// (manager side) and MyCommissionsPage/CommissionDetailPage (customer side), so the two
// sides of the same workflow always describe a given status the same way.
const STATUS_LABELS = {
  pending_manager_review: 'In review',
  changes_requested: 'Changes requested',
  pending_customer_approval: 'Awaiting your approval',
  ratified: 'Ratified',
  in_production: 'In production',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

// Reuses library__badge's existing three tones (processing/completed/failed, see
// Library.css) plus one new one ("attention" — this status needs the viewer to act)
// rather than inventing a fresh palette per status.
const STATUS_TONE = {
  pending_manager_review: 'processing',
  changes_requested: 'attention',
  pending_customer_approval: 'attention',
  ratified: 'completed',
  in_production: 'completed',
  completed: 'completed',
  rejected: 'failed',
  cancelled: 'failed',
}

export default function CommissionStatusBadge({ status, className = '' }) {
  const tone = STATUS_TONE[status] || 'processing'
  return (
    <span className={`library__badge library__badge--${tone} ${className}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}
