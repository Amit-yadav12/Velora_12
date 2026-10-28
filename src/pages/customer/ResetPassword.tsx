import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import supabase, { isDemoMode } from '../../lib/supabase';
import { inputCls } from '../../components/ui';
import { errMsg } from '../../lib/types';

/** This form accepts an authenticated update operation, making provider failures testable without a live project. */
export function ResetPasswordForm({ updatePassword }: { updatePassword: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (e: unknown) {
      setError(errMsg(e) || 'Password could not be updated. Please try again.');
    } finally { setLoading(false); }
  };

  if (done) return <div role="status" className="space-y-4"><p>Your password was updated.</p><Link className="inline-flex min-h-11 items-center text-[var(--text-link-strong)] underline" to="/">Continue to Velora</Link></div>;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="reset-password" className="block mb-2 text-sm">New password</label>
        <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'reset-error' : 'reset-help'} className={inputCls + ' min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
      </div>
      <div>
        <label htmlFor="reset-confirmation" className="block mb-2 text-sm">Confirm new password</label>
        <input id="reset-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'reset-error' : 'reset-help'} className={inputCls + ' min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
      </div>
      <p id="reset-help" className="text-sm text-dim">Use at least 6 characters.</p>
      {error && <p id="reset-error" role="alert" className="text-sm text-red-400">{error}</p>}
      <button disabled={loading} className="w-full min-h-11 grad-btn rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? 'Updating password…' : 'Update password'}</button>
    </form>
  );
}

export default function ResetPassword() {
  const [state, setState] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  useEffect(() => {
    let active = true;
    // Supabase initializes the recovery session from the redirect URL before
    // getSession resolves. An error in the URL must not be masked by an older session.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (isDemoMode || hash.has('error') || hash.has('error_code') || query.has('error') || query.has('error_code')) {
      setState('unavailable');
      return () => { active = false; };
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) setState(!error && data.session?.user ? 'ready' : 'unavailable');
    }).catch(() => { if (active) setState('unavailable'); });
    return () => { active = false; };
  }, []);

  const updatePassword = async (password: string) => {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    if (!data.user) throw new Error('Password update could not be confirmed. Please try again.');
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className="card space-y-5 rounded-2xl p-6">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        {state === 'checking' && <p role="status">Checking your recovery session…</p>}
        {state === 'unavailable' && <div role="alert" className="space-y-3"><p>This recovery link is invalid or expired, or email recovery is unavailable in sample mode. Request a new link from sign-in.</p><Link to="/welcome" className="inline-flex min-h-11 items-center text-[var(--text-link-strong)] underline">Back to sign-in</Link></div>}
        {state === 'ready' && <ResetPasswordForm updatePassword={updatePassword} />}
      </div>
    </main>
  );
}
