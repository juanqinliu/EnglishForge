import { db } from '../services/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { VocabularyLibrary } from '../types';
import { loadLibraries, saveLibraries } from './storage';
import { loadPracticeProgress, savePracticeProgress, PracticeProgress } from './storage';

interface CloudProfile {
  libraries: VocabularyLibrary[];
  practiceProgress?: PracticeProgress | null;
  updatedAt?: number;
}

const profileRef = (uid: string) => doc(db, 'users', uid, 'meta', 'profile');

const uniqueKeyOfItem = (it: any) => `${it.type}#${it.english}#${it.chinese}`;

const mergeLibraries = (a: VocabularyLibrary[], b: VocabularyLibrary[]): VocabularyLibrary[] => {
  const byId = new Map<string, VocabularyLibrary>();
  const pushLib = (lib: VocabularyLibrary) => {
    const existed = byId.get(lib.id);
    if (!existed) {
      byId.set(lib.id, { ...lib, items: [...lib.items] });
      return;
    }
    const seen = new Set<string>(existed.items.map(uniqueKeyOfItem));
    for (const it of lib.items) {
      const key = uniqueKeyOfItem(it);
      if (!seen.has(key)) {
        existed.items.push(it);
        seen.add(key);
      }
    }
    existed.items.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  };
  a.forEach(pushLib);
  b.forEach(pushLib);
  return Array.from(byId.values());
};

export const pullAndMerge = async (uid: string): Promise<void> => {
  const snap = await getDoc(profileRef(uid));
  const localLibs = loadLibraries();
  const localProgress = loadPracticeProgress();

  if (!snap.exists()) {
    const payload: CloudProfile = {
      libraries: localLibs,
      practiceProgress: localProgress,
      updatedAt: Date.now(),
    };
    await setDoc(profileRef(uid), { ...payload, _ts: serverTimestamp() });
    return;
  }

  const data = snap.data() as CloudProfile;
  const remoteLibs = Array.isArray(data.libraries) ? data.libraries : [];
  const mergedLibs = mergeLibraries(localLibs, remoteLibs);
  saveLibraries(mergedLibs);

  const remoteProgress = data.practiceProgress || null;
  const chooseProgress = (() => {
    if (remoteProgress && localProgress) {
      return (remoteProgress.timestamp || 0) >= (localProgress.timestamp || 0)
        ? remoteProgress
        : localProgress;
    }
    return remoteProgress || localProgress || null;
  })();
  if (chooseProgress) {
    try { savePracticeProgress(chooseProgress); } catch {}
  }

  const payload: CloudProfile = {
    libraries: mergedLibs,
    practiceProgress: chooseProgress,
    updatedAt: Date.now(),
  };
  await setDoc(profileRef(uid), { ...payload, _ts: serverTimestamp() });
};

export const pushAll = async (uid: string): Promise<void> => {
  const payload: CloudProfile = {
    libraries: loadLibraries(),
    practiceProgress: loadPracticeProgress(),
    updatedAt: Date.now(),
  };
  await setDoc(profileRef(uid), { ...payload, _ts: serverTimestamp() });
};
