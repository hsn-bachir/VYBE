export function invitationSearch(value: string) {
  const query = value.trim().toLowerCase()
  return { query, valid: /^[a-z0-9_]{3,30}$/.test(query) }
}
