import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Check, Loader2, CalendarCheck, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import supabase from '../../lib/supabase';
import { apiGet } from '../../lib/api';
import { listLocalBookings } from '../../lib/offlineStore';

export default function Profile() {
  const { profile, user, refresh } = useAuth();
  const [name, setName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState({ total: 0, upcoming: 0 });

  useEffect(() => { setName(profile?.full_name || ''); }, [profile]);
  useEffect(() => {
    if (!profile?.email) return;
    const apply = (server: any[]) => {
      const refs = new Set(server.map((b: any) => b.ref));
      const local = listLocalBookings(profile.email).filter((b) => !refs.has(b.ref));
      const all = [...server, ...local];
      const now = Date.now();
      setStats({ total: all.length, upcoming: all.filter(b => new Date(b.start_time).getTime() > now && b.status !== 'cancelled').length });
    };
    apiGet(`/api/my-bookings?email=${encodeURIComponent(profile.email)}`)
      .then((d: any[]) => apply(Array.isArray(d) ? d : []))
      .catch(() => apply([]));
  }, [profile?.email]);

  const save = async () => {
    setSaving(true); setSaved(false);
    await supabase.from('profiles').update({ full_name: name, phone }).eq('id', user!.id);
    refresh(); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const initials = (name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2);
  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card p-6 text-center mb-5">
        <div className="h-20 w-20 rounded-full grad-btn grid place-items-center text-white text-2xl font-semibold mx-auto">{initials}</div>
        <h1 className="mt-3 text-xl font-semibold">{profile?.full_name}</h1>
        <p className="text-sm text-dim">{profile?.email}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface p-3"><CalendarCheck className="h-4 w-4 text-[var(--color-brand-indigo)] mx-auto" /><p className="text-xl font-semibold mt-1">{stats.total}</p><p className="text-xs text-dim">Total bookings</p></div>
          <div className="rounded-xl bg-surface p-3"><Clock className="h-4 w-4 text-emerald-400 mx-auto" /><p className="text-xl font-semibold mt-1">{stats.upcoming}</p><p className="text-xs text-dim">Upcoming</p></div>
        </div>
      </motion.div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Edit profile</h2>
        <div className="space-y-3">
          <div><label className="text-xs text-dim">Full name</label><div className="relative mt-1"><User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" /><input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl bg-elev border border-app pl-10 pr-4 py-3 text-sm outline-none focus:border-[var(--color-brand-indigo)]" /></div></div>
          <div><label className="text-xs text-dim">Email</label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" /><input value={profile?.email || ''} disabled className="w-full rounded-xl bg-elev border border-app pl-10 pr-4 py-3 text-sm outline-none opacity-60" /></div></div>
          <div><label className="text-xs text-dim">Phone</label><div className="relative mt-1"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" /><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl bg-elev border border-app pl-10 pr-4 py-3 text-sm outline-none focus:border-[var(--color-brand-indigo)]" /></div></div>
          <button onClick={save} disabled={saving} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <><Check className="h-4 w-4" /> Saved</> : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
