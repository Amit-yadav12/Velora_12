import { motion } from 'framer-motion';
import { Moon, Sun, Bell, Globe, Shield, LogOut, ChevronRight } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return <button onClick={onChange} className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'grad-btn' : 'bg-[var(--surface-hover)]'}`}><motion.span layout className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow" style={{ left: on ? 22 : 2 }} /></button>;
}

export default function Settings() {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-dim mb-5">Preferences and account.</p>

      <div className="card divide-y divide-[var(--border)]">
        <Setting icon={theme === 'dark' ? Moon : Sun} title="Dark mode" sub="Switch between light and dark themes"><Toggle on={theme === 'dark'} onChange={toggle} /></Setting>
        <Setting icon={Bell} title="Email notifications" sub="Booking confirmations & reminders"><Toggle on={emailNotif} onChange={() => setEmailNotif(v => !v)} /></Setting>
        <Setting icon={Bell} title="Push notifications" sub="Real-time alerts on your device"><Toggle on={pushNotif} onChange={() => setPushNotif(v => !v)} /></Setting>
        <Setting icon={Globe} title="Language" sub="English (US)"><ChevronRight className="h-4 w-4 text-dim" /></Setting>
        <Setting icon={Shield} title="Privacy & security" sub="Manage your data"><ChevronRight className="h-4 w-4 text-dim" /></Setting>
      </div>

      <button onClick={async () => { await signOut(); nav('/welcome', { replace: true }); }} className="mt-4 w-full card p-4 flex items-center gap-3 text-red-400 hover:bg-[var(--surface-hover)]"><LogOut className="h-4 w-4" /> Sign out</button>
      <p className="mt-6 text-center text-xs text-dim">Velora · Universal Appointment Booking</p>
    </div>
  );
}

function Setting({ icon: Icon, title, sub, children }: any) {
  return (
    <div className="p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-surface grid place-items-center shrink-0"><Icon className="h-4 w-4 text-[var(--color-brand-indigo)]" /></div>
      <div className="flex-1 min-w-0"><p className="text-sm font-medium">{title}</p><p className="text-xs text-dim">{sub}</p></div>
      {children}
    </div>
  );
}
