import { VocabularyLibrary } from '../types';
import { parseTxtToVocabulary } from '../utils/txtParser';

// Load libraries from WordFactory/listening-to-speaking
const speakingFiles = import.meta.glob('../../WordFactory/listening-to-speaking/*.txt', { as: 'raw', eager: true });
const speakingLibraries: VocabularyLibrary[] = Object.entries(speakingFiles).map(([path, content]) => {
    const fileName = path.split('/').pop()?.replace('.txt', '') || 'Unknown Library';
    // Use 'speak_' prefix + safe filename as stable ID
    const stableId = 'speak_' + fileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return parseTxtToVocabulary(content as string, fileName, stableId, 'read-speak');
});

// Load libraries from WordFactory/listenning-to-writting (Keeping user's directory name)
const writingFiles = import.meta.glob('../../WordFactory/listenning-to-writting/*.txt', { as: 'raw', eager: true });
const writingLibraries: VocabularyLibrary[] = Object.entries(writingFiles).map(([path, content]) => {
    const fileName = path.split('/').pop()?.replace('.txt', '') || 'Unknown Library';
    // Use 'write_' prefix + safe filename as stable ID
    const stableId = 'write_' + fileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return parseTxtToVocabulary(content as string, fileName, stableId, 'dictation');
});

export const defaultLibraries: VocabularyLibrary[] = [
    ...speakingLibraries,
    ...writingLibraries
];
