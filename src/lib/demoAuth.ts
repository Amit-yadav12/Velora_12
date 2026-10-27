// Shared demo identities exist only in the local preview's in-memory auth.
// They must never create or authenticate a public account on a real project.
import supabase, { isDemoMode } from './supabase';

export type DemoRole = 'admin' | 'customer';
export const DEMO_PASSWORD = 'velora123';
export const demoEmailFor = (role: DemoRole): string => role === 'admin' ? 'admin@velora.ai' : 'customer@velora.ai';
export const demoNameFor = (role: DemoRole): string => role === 'admin' ? 'Demo Admin' : 'Demo Customer';
export function isCanonicalDemoCredential(email: string, password: string): boolean {
  const normalized = email.trim().toLowerCase();
  return password === DEMO_PASSWORD && (normalized === demoEmailFor('customer') || normalized === demoEmailFor('admin'));
}
export interface DemoProgress { step: 'signin' | 'signup'; message: string; }
export interface DemoSignInResult { email: string; role: DemoRole; }

export async function signInDemo(role: DemoRole, onProgress?: (p: DemoProgress) => void): Promise<DemoSignInResult> {
  if (!isDemoMode) throw new Error('Demo accounts are available only in the local preview.');
  const email = demoEmailFor(role);
  onProgress?.({ step: 'signin', message: 'Opening the local demo…' });
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw error;
  return { email, role };
}
