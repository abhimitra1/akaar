// Central definition of the studio role hierarchy — customer/artisan/designer/
// studio_manager/studio_admin, plus the separate is_super_admin flag — so every route
// guard, nav conditional, and the Team console all agree on what each tier can do instead
// of repeating an ad hoc OR-chain per component. Mirrors supabase/migrations/
// 010_role_hierarchy.sql's can_assign_role()/is_studio_manager_or_above() exactly; if
// that migration's logic changes, this file needs to change with it.

export const ROLE_LABELS = {
  customer: 'Customer',
  artisan: 'Artisan',
  designer: 'Designer',
  studio_manager: 'Studio Manager',
  studio_admin: 'Studio Admin',
}

// "Cumulative capability" only — who gets studio_manager's day-to-day review capability
// on top of their own. NOT role-assignment authority (see MANAGEABLE_ROLES below): a
// rank comparison alone would incorrectly let a studio_manager "manage" customers too,
// which isn't what was specified.
const ROLE_RANK = { customer: 0, artisan: 1, designer: 1, studio_manager: 2, studio_admin: 3 }

// Mirrors can_assign_role() in 010_role_hierarchy.sql exactly — who may promote/demote
// people into which roles. Deliberately not derived from ROLE_RANK: studio_manager
// manages only artisan/designer, not customer, even though customer ranks lower.
const MANAGEABLE_ROLES = {
  studio_admin: ['customer', 'studio_manager', 'artisan', 'designer'],
  studio_manager: ['customer', 'artisan', 'designer'],
}

export function roleLabel(user) {
  if (user?.is_super_admin) return 'Super Admin'
  return ROLE_LABELS[user?.role] || user?.role || 'Customer'
}

// Studio-manager-tier capability (the order review queue, "assign to a designer", team
// visibility default) — studio_manager, studio_admin, or a super admin standing in.
export function isStudioManagerOrAbove(user) {
  return Boolean(user?.is_super_admin) || ROLE_RANK[user?.role] >= 2
}

export function isStudioAdmin(user) {
  return Boolean(user?.is_super_admin) || user?.role === 'studio_admin'
}

export function isDesigner(user) {
  return Boolean(user?.is_super_admin) || user?.role === 'designer'
}

// Gates the whole /studio panel — every role that has ANY section to see there. Artisans
// don't yet (order fulfillment/acceptance is a later phase, see the plan's Phase 2 note),
// so they're deliberately not included even though they're a "managed" role.
export function hasStudioAccess(user) {
  return isStudioManagerOrAbove(user) || isDesigner(user)
}

// Role values `user` may promote/demote people into, given their own role — empty for
// anyone who isn't studio_admin/studio_manager/super_admin (matches can_assign_role()'s
// `else false` branch).
export function manageableRoles(user) {
  if (user?.is_super_admin) return ['customer', 'artisan', 'designer', 'studio_manager', 'studio_admin']
  return MANAGEABLE_ROLES[user?.role] || []
}
