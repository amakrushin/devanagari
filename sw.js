const CACHE_VERSION = 'devanagari-v0.1.1';

const SHELL = [
    './',
    './index.html',
    './style.css',
    './js/app.js',
    './js/scheduler.js',
    './js/audio.js',
    './js/sound.js',
    './characters.json',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_VERSION)
        .then(cache => cache.addAll(SHELL))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET')
        return;
    const url = new URL(request.url);
    if (url.origin !== location.origin)
        return;
    if (url.pathname.endsWith('/characters.json')) {
        // Network-first: character data updates should not require a cache version bump.
        event.respondWith(fetch(request)
            .then(response => {
                const copy = response.clone();
                caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
                return response;
            })
            .catch(() => caches.match(request)));
        return;
    }
    event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
