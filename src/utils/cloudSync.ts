import { db } from '../services/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { VocabularyLibrary } from '../types';
import { loadLibraries, saveLibraries, getDeletedLibraryIds, addDeletedLibraryId } from './storage';
import { loadPracticeProgress, savePracticeProgress, PracticeProgress } from './storage';

interface CloudProfile {
  libraries: VocabularyLibrary[];
  deletedLibraryIds?: string[];
  practiceProgress?: PracticeProgress | null;
  updatedAt?: number;
}

const profileRef = (uid: string) => doc(db, 'users', uid, 'meta', 'profile');

// 智能合并策略：基于 ID、updatedAt 和 Tombstone
const smartMergeLibraries = (
  localLibs: VocabularyLibrary[],
  remoteLibs: VocabularyLibrary[],
  localDeletedIds: string[],
  remoteDeletedIds: string[]
): { merged: VocabularyLibrary[], finalDeletedIds: string[] } => {

  const allDeletedIds = new Set([...localDeletedIds, ...remoteDeletedIds]);
  const mergedMap = new Map<string, VocabularyLibrary>();

  const processLib = (lib: VocabularyLibrary) => {
    // 如果该词库在删除列表中，则忽略
    if (allDeletedIds.has(lib.id)) return;

    const existing = mergedMap.get(lib.id);
    if (!existing) {
      mergedMap.set(lib.id, lib);
      return;
    }

    // 冲突解决：使用 updatedAt 更大的版本
    const libTime = lib.updatedAt || lib.createdAt || 0;
    const existingTime = existing.updatedAt || existing.createdAt || 0;

    if (libTime > existingTime) {
      mergedMap.set(lib.id, lib);
    }
  };

  localLibs.forEach(processLib);
  remoteLibs.forEach(processLib);

  return {
    merged: Array.from(mergedMap.values()),
    finalDeletedIds: Array.from(allDeletedIds)
  };
};

export const pullAndMerge = async (uid: string): Promise<void> => {
  console.log('[云同步] 🔄[V2] 开始智能同步...', { uid });

  try {
    const snap = await getDoc(profileRef(uid));
    const localLibs = loadLibraries();
    const localProgress = loadPracticeProgress();
    const localDeletedIds = getDeletedLibraryIds();

    if (!snap.exists()) {
      console.log('[云同步] 📤 云端无数据，上传本地数据...');
      const payload: CloudProfile = {
        libraries: localLibs,
        deletedLibraryIds: localDeletedIds,
        practiceProgress: localProgress,
        updatedAt: Date.now(),
      };
      await setDoc(profileRef(uid), { ...payload, _ts: serverTimestamp() });
      console.log('[云同步] ✅ 首次同步完成');
      return;
    }

    const data = snap.data() as CloudProfile;
    const remoteLibs = Array.isArray(data.libraries) ? data.libraries : [];
    const remoteDeletedIds = Array.isArray(data.deletedLibraryIds) ? data.deletedLibraryIds : [];

    console.log(`[云同步] 本地: ${localLibs.length} (删${localDeletedIds.length}), 云端: ${remoteLibs.length} (删${remoteDeletedIds.length})`);

    const { merged, finalDeletedIds } = smartMergeLibraries(localLibs, remoteLibs, localDeletedIds, remoteDeletedIds);

    console.log('[云同步] 合并结果:', merged.length, '个词库');
    saveLibraries(merged);

    // 更新本地删除记录
    finalDeletedIds.forEach(id => {
      if (!localDeletedIds.includes(id)) addDeletedLibraryId(id);
    });

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
      try { savePracticeProgress(chooseProgress); } catch (e) { console.warn('保存进度失败', e); }
    }

    const payload: CloudProfile = {
      libraries: merged,
      deletedLibraryIds: finalDeletedIds,
      practiceProgress: chooseProgress,
      updatedAt: Date.now(),
    };
    await setDoc(profileRef(uid), { ...payload, _ts: serverTimestamp() });
    console.log('[云同步] ✅ 智能同步完成');
  } catch (error: any) {
    console.error('[云同步] ❌ 同步失败:', error);
    if (error.code === 'permission-denied') throw new Error('没有权限访问云端数据，请检查 Firestore 安全规则配置');
    else if (error.code === 'unavailable') throw new Error('网络连接失败，请检查网络连接');
    else throw new Error(`同步失败: ${error.message || '未知错误'}`);
  }
};

export const pushAll = async (uid: string): Promise<void> => {
  console.log('[云同步] 📤 推送本地数据到云端...');
  try {
    const payload: CloudProfile = {
      libraries: loadLibraries(),
      deletedLibraryIds: getDeletedLibraryIds(),
      practiceProgress: loadPracticeProgress(),
      updatedAt: Date.now(),
    };
    console.log('[云同步] 推送词库数:', payload.libraries.length);
    await setDoc(profileRef(uid), { ...payload, _ts: serverTimestamp() });
    console.log('[云同步] ✅ 推送完成');
  } catch (error: any) {
    console.error('[云同步] ❌ 推送失败:', error);
    if (error.code === 'permission-denied') {
      throw new Error('没有权限上传数据，请检查 Firestore 安全规则配置');
    } else if (error.code === 'unavailable') {
      throw new Error('网络连接失败，请检查网络连接');
    } else {
      throw new Error(`推送失败: ${error.message || '未知错误'}`);
    }
  }
};
