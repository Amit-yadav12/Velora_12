// QR ticket verification client — resolves a token or full /verify/ URL
// against the signed verification endpoint.
export interface VerifyResult {
  valid: boolean;
  reason?: string;
  status?: string;
  demo?: boolean;
  message?: string;
  booking?: { ref: string; business?: string | null; service?: string | null; start_time?: string | null };
  checked_at?: string;
}

export function tokenFromInput(input: string): string {
  const t = (input || '').trim();
  const m = t.match(/\/verify\/([^?#\s]+)/);
  const raw = m ? m[1] : t;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function verifyToken(input: string): Promise<VerifyResult> {
  const token = tokenFromInput(input);
  if (!token) throw new Error('Paste a ticket link or token to verify it.');
  let res: Response;
  try {
    res = await fetch(`/api/verify-booking?token=${encodeURIComponent(token)}`);
  } catch {
    throw new Error("We couldn't reach Velora right now. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as VerifyResult;
  if (!res.ok) throw new Error((data as any)?.error || 'Verification failed. Please try again.');
  return data;
}
