// Audio arrives at a later milestone. The rest of the app asks this layer for
// clips; null means "no clip yet" and the UI omits playback.

export function resolveClip(slug) {
    return null;
}

export async function playClip(slug) {
    return false;
}
