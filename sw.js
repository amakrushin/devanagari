const CACHE_VERSION = 'devanagari-v0.3.0';
// Clips are immutable per slug and heavy, so they live in their own cache
// that survives shell version bumps.
const AUDIO_CACHE = 'devanagari-audio-v1';

const SHELL = [
    './',
    './index.html',
    './style.css',
    './js/app.js',
    './js/scheduler.js',
    './js/words.js',
    './js/stats.js',
    './js/audio.js',
    './js/sound.js',
    './characters.json',
    './words.json',
    './audio/manifest.json',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// Best-effort: a failed clip download never fails the install and is healed
// by the runtime caching below on the next online playback.
async function prefetchAudio() {
    const manifest = await (await fetch('./audio/manifest.json')).json();
    const cache = await caches.open(AUDIO_CACHE);
    await Promise.allSettled(manifest.clips.map(async slug => {
        const url = `./audio/${slug}.mp3`;
        if (!await cache.match(url))
            await cache.add(url);
    }));
}

self.addEventListener('install', event => {
    event.waitUntil(Promise.all([
        caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)),
        prefetchAudio().catch(() => {}),
    ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys
            .filter(k => k !== CACHE_VERSION && k !== AUDIO_CACHE)
            .map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET')
        return;
    const url = new URL(request.url);
    if (url.origin !== location.origin)
        return;
    if (url.pathname.endsWith('/characters.json') || url.pathname.endsWith('/words.json')
        || url.pathname.endsWith('/audio/manifest.json')) {
        // Network-first: data updates should not require a cache version bump.
        event.respondWith(fetch(request)
            .then(response => {
                const copy = response.clone();
                caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
                return response;
            })
            .catch(() => caches.match(request)));
        return;
    }
    if (url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3')) {
        // Requests come from fetch() in js/audio.js (never the media element),
        // so no Range handling is needed here.
        event.respondWith(caches.open(AUDIO_CACHE).then(async cache => {
            const hit = await cache.match(request.url);
            if (hit)
                return hit;
            const response = await fetch(request);
            if (response.ok)
                cache.put(request.url, response.clone());
            return response;
        }));
        return;
    }
    event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
