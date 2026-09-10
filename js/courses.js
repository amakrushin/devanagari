// Course registry: pure data shared by the app and the tests. A course is a
// character file, an optional words file, and the labels the shell shows.

export const DEFAULT_COURSE = 'devanagari';

export const COURSES = {
    devanagari: {
        id: 'devanagari',
        page: './',
        dataFile: 'characters.json',
        wordsFile: 'words.json',
        title: 'devanagari',
        tagline: 'Nepali alphabet trainer',
        progressKey: 'devanagari.progress',
        language: 'Nepali',
    },
    russian: {
        id: 'russian',
        page: './russian.html',
        dataFile: 'russian.json',
        wordsFile: 'russian-words.json',
        title: 'russian',
        tagline: 'Russian alphabet trainer',
        progressKey: 'russian.progress',
        language: 'Russian',
    },
    hebrew: {
        id: 'hebrew',
        page: './hebrew.html',
        dataFile: 'hebrew.json',
        wordsFile: 'hebrew-words.json',
        title: 'hebrew',
        tagline: 'Hebrew alphabet trainer',
        progressKey: 'hebrew.progress',
        language: 'Hebrew',
        rtl: true,
    },
};

export function resolveCourse(id) {
    return COURSES[id] ?? COURSES[DEFAULT_COURSE];
}

export function recallModeLabel(mode, course) {
    return mode === 'say'
        ? `English → ${course.language}`
        : `${course.language} → English`;
}

// Export files name their course; files from before the field existed are
// Devanagari backups.
export function exportCourseId(parsed) {
    return parsed?.course ?? DEFAULT_COURSE;
}
