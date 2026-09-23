import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function stableHash(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function offlineServiceWorker(): Plugin {
  return {
    name: 'folio-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const bundleFiles = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((fileName) => !fileName.endsWith('.map') && fileName !== 'sw.js')
        .map((fileName) => `./${fileName}`)
        .sort()
      const staticFiles = [
        './',
        './index.html',
        './manifest.webmanifest',
        './offline.html',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './icons/icon-maskable-512.png',
      ]
      const precache = [...new Set([...staticFiles, ...bundleFiles])]
      const signature = Object.values(bundle).map((entry) => `${entry.fileName}:${entry.type === 'chunk' ? entry.code : String(entry.source)}`).sort().join('|')
      const revision = stableHash(signature)
      const source = `/* Folio generated service worker. */
const REVISION = ${JSON.stringify(revision)};
const APP_CACHE = 'folio-app-' + REVISION;
const RUNTIME_CACHE = 'folio-runtime-v1';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) =>
      (key.startsWith('folio-app-') && key !== APP_CACHE) ||
      key.startsWith('obsidian-editorial-app-') ||
      key === 'obsidian-editorial-runtime-v1'
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.postMessage({ type: 'OFFLINE_READY', revision: REVISION }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function navigationResponse(request) {
  const appCache = await caches.open(APP_CACHE);
  const shell = await appCache.match('./index.html') || await appCache.match('./');
  if (shell) return shell;
  try { return await fetch(request); }
  catch { return (await appCache.match('./offline.html')) || Response.error(); }
}

async function cachedAssetResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const runtime = await caches.open(RUNTIME_CACHE);
      runtime.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function optionalFontResponse(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  const cached = await runtime.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') runtime.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('notificationclick', (event) => {
  const occurrenceId = event.notification?.data?.occurrenceId;
  const action = event.action || 'open';
  event.notification?.close();
  if (!occurrenceId) return;

  event.waitUntil((async () => {
    const target = new URL('./', self.registration.scope);
    target.searchParams.set('reminderOccurrence', occurrenceId);
    target.searchParams.set('reminderAction', action);

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((item) => item.url.startsWith(self.registration.scope)) || windows[0];
    if (client) {
      if ('navigate' in client) await client.navigate(target.href);
      await client.focus();
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cachedAssetResponse(request));
    return;
  }
  if (request.destination === 'font' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(optionalFontResponse(request));
  }
});
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
  base: './',
})
