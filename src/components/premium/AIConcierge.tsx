import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2, Navigation, ArrowRight, Mic } from 'lucide-react';
import { apiSend } from '../../lib/api';
import { useLocation } from '../../contexts/LocationContext';

interface Msg { role: 'user' | 'ai'; text: string; action?: any; }
const SUGGESTIONS = ['Book a dentist tomorrow afternoon', 'Find the nearest salon', 'Show my appointments', 'Reschedule my booking'];

export default function AIConcierge() {
  const nav = useNavigate();
  const { city, mapCenter } = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, thinking]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setMsgs(m => [...m, { role: 'user', text }]); setInput(''); setThinking(true);
    try {
      const res = await apiSend('/api/concierge', 'POST', { message: text, city: city.name, lat: mapCenter.lat, lng: mapCenter.lng });
      setMsgs(m => [...m, { role: 'ai', text: res.reply, action: res.action }]);
    } catch { setMsgs(m => [...m, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]); }
    finally { setThinking(false); }
  };

  const runAction = (action: any) => {
    if (!action) return;
    if (action.type === 'directions' && action.maps_link) { window.open(action.maps_link, '_blank'); return; }
    if (action.to) { nav(action.to); setOpen(false); }
  };

  // Voice input via Web Speech API (progressive enhancement)
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { send('Find the nearest clinic'); return; }
    const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false;
    setListening(true);
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setInput(t); setListening(false); send(t); };
    rec.onerror = () => setListening(false); rec.onend = () => setListening(false);
    rec.start();
  };

  return (
    <>
      {/* Floating launcher */}
      <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.5 }}
        onClick={() => setOpen(o => !o)} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
        className="fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-[70] h-14 w-14 rounded-2xl grad-btn shadow-2xl grid place-items-center">
        <AnimatePresence mode="wait">
          {open ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ opacity: 0 }}><X className="h-6 w-6 text-white" /></motion.span>
            : <motion.span key="s" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ opacity: 0 }}><Sparkles className="h-6 w-6 text-white" /></motion.span>}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }} transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="fixed bottom-40 lg:bottom-24 right-4 lg:right-6 z-[70] w-[calc(100vw-2rem)] sm:w-96 h-[520px] max-h-[70vh] glass rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-app">
              <div className="h-9 w-9 rounded-xl grad-btn grid place-items-center"><Sparkles className="h-4 w-4 text-white" /></div>
              <div><p className="font-semibold text-sm">Velora Concierge</p><p className="text-[11px] text-emerald-400 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" /> Online</p></div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
              {msgs.length === 0 && (
                <div>
                  <div className="rounded-2xl bg-surface border border-app p-3.5 text-sm">👋 Hi! I'm your booking concierge. I can book, reschedule, cancel, find businesses, and open directions — just ask.</div>
                  <div className="mt-3 space-y-2">
                    {SUGGESTIONS.map(s => <button key={s} onClick={() => send(s)} className="w-full text-left text-sm rounded-xl border border-app px-3 py-2 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-between group">{s}<ArrowRight className="h-3.5 w-3.5 text-dim opacity-0 group-hover:opacity-100" /></button>)}
                  </div>
                </div>
              )}
              <AnimatePresence initial={false}>
                {msgs.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'grad-btn text-white' : 'bg-surface border border-app'}`}>
                      <p>{m.text}</p>
                      {m.action && (m.action.to || m.action.maps_link) && (
                        <button onClick={() => runAction(m.action)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg bg-white/15 px-2.5 py-1.5 hover:bg-white/25 transition-colors">
                          {m.action.type === 'directions' ? <><Navigation className="h-3 w-3" /> Open directions</> : m.action.type === 'book' ? <>Continue booking <ArrowRight className="h-3 w-3" /></> : <>Open <ArrowRight className="h-3 w-3" /></>}
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {thinking && <div className="flex justify-start"><div className="bg-surface border border-app rounded-2xl px-4 py-3 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-dim)', animationDelay: `${i * 0.15}s` }} />)}</div></div>}
            </div>

            <form onSubmit={e => { e.preventDefault(); send(input); }} className="p-3 border-t border-app flex items-center gap-2">
              <button type="button" onClick={startVoice} className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 transition-colors ${listening ? 'bg-red-500/20 text-red-400' : 'border border-app text-muted'}`}><Mic className="h-4 w-4" /></button>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything…" className="flex-1 bg-elev border border-app rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)]" />
              <button type="submit" disabled={thinking || !input.trim()} className="h-10 w-10 rounded-xl grad-btn grid place-items-center shrink-0 disabled:opacity-50">{thinking ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
