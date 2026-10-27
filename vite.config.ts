import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()];
  try {
    // @ts-expect-error - optional local dev plugin, not present in all envs
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {
    // optional plugin absent — safe to ignore
  }
  try {
    // @ts-expect-error - dev-only API middleware (plain JS, serve only)
    const api = await import('./dev-api.js');
    if (typeof api.devApi === 'function') plugins.push(api.devApi());
  } catch {
    // dev api middleware absent — /api calls fall back gracefully
  }

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_', 'GOOGLE_']);

  // Stamp the deployment origin into index.html (canonical / og:url /
  // structured data) at BUILD time. Crawlers do not execute JS, so a runtime
  // rewrite alone cannot fix SEO on a new domain; the host's APP_URL /
  // VITE_APP_URL is the single source of truth.
  let appUrl = '';
  try {
    const parsed = new URL(String(process.env.APP_URL || process.env.VITE_APP_URL || env.VITE_APP_URL || ''));
    if (['http:', 'https:'].includes(parsed.protocol)) appUrl = parsed.origin;
  } catch { /* no public origin configured; relative metadata is safe */ }
  if (appUrl) {
    plugins.push({
      name: 'velora-seo-origin',
      transformIndexHtml(html: string) {
        return html.replace('</head>', `<link rel="canonical" href="${appUrl}/" /><meta property="og:url" content="${appUrl}/" /></head>`)
          .replace('"name": "Velora",', `"name": "Velora",\n        "url": "${appUrl}/",`);
      },
    });
  }
  if (env.GOOGLE_MAPS_API_KEY) process.env.GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;

  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_')) processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    // APP_URL is server-side; expose VITE_APP_URL for Calendar/share on Netlify.
    define: processEnvDefines,
    server: {
      host: '0.0.0.0',
      // Allow cloud preview hosts (Arena/E2B sandboxes etc.).
      allowedHosts: true as const,
    },
    build: {
      // Split large vendor libs into their own cacheable chunks so the initial
      // parse/eval stays small and navigations feel instant.
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-motion': ['framer-motion'],
            'vendor-supabase': ['@supabase/supabase-js'],
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
  };
})
