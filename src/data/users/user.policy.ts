type PolicyUser = { isAdmin: boolean };

export function canAdmin(user: PolicyUser | null): boolean {
  return user?.isAdmin === true;
}
