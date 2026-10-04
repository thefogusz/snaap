// Server policy: database roles, environment lists and local test accounts cannot widen access.
export const ADMIN_EMAIL = "kirdssadee@gmail.com";
export function isAdminIdentity(
  user: { email?: string | null; google_sub?: string | null } | undefined,
): boolean {
  return !!user?.google_sub && user.email?.toLowerCase() === ADMIN_EMAIL;
}
