/** Public APIs must not expose the account identity behind a business. */
export function publicBusiness(row) {
  if (!row) return row;
  const copy = { ...row };
  delete copy.owner_user_id;
  delete copy.owner_email;
  return copy;
}
