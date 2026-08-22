// Pronunciation clips. The manifest lists which slugs have a committed mp3;
// resolveClip returning null means "no clip" and the UI omits playback.
//
// Two iOS constraints shape this module. Safari sends Range requests for
// media element loads, which a cache-first service worker answers badly, so
// each card's clip is prefetched with a plain fetch and played from a blob
// object URL. And play() must start inside the tap's call stack, so playClip
// is synchronous; only a tap that lands before its prefetch finishes falls
// back to playing when the blob arrives.

let clips = new Set();
let player = null;
let loaded = {slug: null, url: null, promise: null};

export async function loadManifest() {
    try {
        const response = await fetch('audio/manifest.json');
        const manifest = await response.json();
        if (Array.isArray(manifest?.clips))
            clips = new Set(manifest.clips);
    } catch {
        // No manifest, no buttons; the drill works without audio.
    }
}

export function resolveClip(slug) {
    return clips.has(slug) ? `audio/${slug}.mp3` : null;
}

export function preload(slug) {
    const url = resolveClip(slug);
    if (!url || loaded.slug === slug)
        return;
    if (loaded.url)
        URL.revokeObjectURL(loaded.url);
    const entry = {slug, url: null, promise: null};
    entry.promise = fetch(url)
        .then(response => response.blob())
        .then(blob => {
            entry.url = URL.createObjectURL(blob);
        })
        .catch(() => {});
    loaded = entry;
}

export function playClip(slug) {
    if (!resolveClip(slug))
        return false;
    player ??= new Audio();
    if (loaded.slug !== slug) {
        preload(slug);
    }
    const entry = loaded;
    if (entry.url) {
        if (player.src === entry.url)
            player.currentTime = 0;
        else
            player.src = entry.url;
        player.play().catch(() => {});
    } else {
        entry.promise?.then(() => {
            if (loaded === entry && entry.url) {
                player.src = entry.url;
                player.play().catch(() => {});
            }
        });
    }
    return true;
}
