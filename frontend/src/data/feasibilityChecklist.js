// Structured manufacturing-feasibility criteria a studio manager checks before a
// co-created design can move toward production — named directly after the constraints in
// PATHS' own whitepaper (public/whitepaper.html, the craft-feasibility filter "wall
// thickness, overhang, shrinkage, kiln envelope"). Declarative like data/adminTables.js,
// so ManagerReviewPage's editable grid and OrderDetailPage's read-only view of the same
// review share one definition instead of duplicating criterion copy in two components.
// Thresholds are intentionally not encoded here — that's manager judgment per piece, not
// an automated rule.
export const FEASIBILITY_CRITERIA = [
  {
    key: 'wall_thickness',
    label: 'Wall thickness',
    hint: 'Can the design hold a wall thick enough to survive throwing, drying and firing?',
  },
  {
    key: 'overhang',
    label: 'Overhang / unsupported geometry',
    hint: 'Any unsupported ledge, handle or lip the material and technique can’t hold up on its own?',
  },
  {
    key: 'shrinkage',
    label: 'Shrinkage tolerance',
    hint: 'Will the piece still match its stated dimensions after clay shrinkage through drying and firing?',
  },
  {
    key: 'kiln_envelope',
    label: 'Kiln envelope',
    hint: 'Does the piece fit the available kiln at its stated height/dimensions?',
  },
  {
    key: 'material_technique_match',
    label: 'Material / technique compatibility',
    hint: 'Is the requested material actually achievable with the chosen technique?',
  },
]

// 'na' rather than 'n/a' — this value round-trips through a CSS class name
// (order__pill--{status} in FeasibilityChecklist.jsx/Order.css), where a literal slash
// isn't a safe bare selector character.
export const FEASIBILITY_STATUSES = ['ok', 'not_feasible', 'na']

export const FEASIBILITY_STATUS_LABELS = {
  ok: 'Feasible',
  not_feasible: 'Not feasible',
  na: 'N/A',
}

// Fresh { [key]: { status: 'na', note: '' } } for every known criterion — the shape
// ManagerReviewPage seeds its editable checklist state with.
export function emptyConstraintFlags() {
  return Object.fromEntries(FEASIBILITY_CRITERIA.map((c) => [c.key, { status: 'na', note: '' }]))
}
