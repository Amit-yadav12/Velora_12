import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { storageGet, storageSet } from '../../lib/storage';
import { LogoMark } from '../Logo';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      if (!storageGet('velora-install-dismissed')) setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null); setShow(false);
  };
  const dismiss = () => { setShow(false); storageSet('velora-install-dismissed', '1'); };

  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
          className="fixed bottom-40 lg:bottom-24 left-4 z-[65] glass rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 max-w-[300px]">
          <LogoMark size={40} className="shrink-0" />
          <div className="flex-1 min-w-0"><p className="text-sm font-medium">Install Velora</p><p className="text-xs text-dim">Add to home screen for offline access.</p></div>
          <button onClick={install} className="grad-btn text-white text-xs font-medium rounded-lg px-3 py-2 shrink-0">Install</button>
          <button onClick={dismiss} className="text-dim shrink-0"><X className="h-4 w-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
