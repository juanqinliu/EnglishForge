import { useState, useEffect, useRef } from 'react';
import { VocabularyLibrary } from './types';
import { LibraryManager } from './components/LibraryManager';
import { PracticeMode } from './components/PracticeMode';

import { loadLibraries, saveLibraries, getOrCreateWrongLibrary } from './utils/storage';
import { initAudio } from './utils/audioPlayer';
import { BookOpen } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import Login from './components/Auth/Login';
import { ReadAndSpeakMode } from './components/ReadAndSpeak/ReadAndSpeakMode';
import { pullAndMerge, pushAll } from './utils/cloudSync';

function App() {
  const { user, loading, signOutApp } = useAuth();
  const [libraries, setLibraries] = useState<VocabularyLibrary[]>([]);
  const [view, setView] = useState<'library' | 'practice' | 'read-speak'>('library');
  const [initialLibraryId, setInitialLibraryId] = useState<string>('');
  const [readSpeakLibraryId, setReadSpeakLibraryId] = useState<string>('');

  const pushTimerRef = useRef<number | null>(null);


  // 加载词库
  useEffect(() => {
    const loaded = loadLibraries();

    // 确保错题词库存在
    const wrongLibrary = getOrCreateWrongLibrary(loaded);
    const hasWrongLibrary = loaded.some(lib => lib.id === 'global_wrong_items');

    if (!hasWrongLibrary) {
      const updatedLibraries = [...loaded, wrongLibrary];
      setLibraries(updatedLibraries);
      saveLibraries(updatedLibraries);
    } else {
      setLibraries(loaded);
    }
  }, []);

  // 初始化音频（在用户第一次交互时）
  useEffect(() => {
    const handleFirstInteraction = () => {
      initAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // 保存词库
  const handleLibrariesChange = (newLibraries: VocabularyLibrary[]) => {
    setLibraries(newLibraries);
    saveLibraries(newLibraries);
    // 登录状态下，节流推送云端
    if (user) {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = window.setTimeout(() => {
        pushAll(user.uid).catch(() => { });
      }, 1200);
    }
  };

  // 开始练习
  const handleStartPractice = (libraryId: string) => {
    setInitialLibraryId(libraryId);
    setView('practice');
  };

  const handleStartReadSpeak = (libraryId: string) => {
    setReadSpeakLibraryId(libraryId);
    setView('read-speak');
  };

  // 登录后执行一次云端拉取合并，并刷新本地状态
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      try {
        await pullAndMerge(user.uid);
        if (mounted) {
          const refreshed = loadLibraries();
          // 确保错题词库存在
          const wrongLibrary = getOrCreateWrongLibrary(refreshed);
          const hasWrongLibrary = refreshed.some(lib => lib.id === 'global_wrong_items');
          const finalLibs = hasWrongLibrary ? refreshed : [...refreshed, wrongLibrary];
          setLibraries(finalLibs);
          saveLibraries(finalLibs);
        }
      } catch { }
    })();
    return () => { mounted = false; };
  }, [user]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* 头部导航 */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="relative">
                <img src="./Logo.png" alt="EnglishForge" className="w-16 h-16 object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  EnglishForge
                </h1>
                <p className="text-sm text-gray-600 font-medium">英语锻造坊</p>
              </div>
            </div>
            <div className="flex gap-2">
              {user && view !== 'library' && (
                <button
                  onClick={() => setView('library')}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg transition font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  <BookOpen className="w-5 h-5" />
                  返回词库管理
                </button>
              )}

              {user && (
                <button
                  onClick={() => signOutApp()}
                  className="px-4 py-2 rounded-lg transition font-semibold bg-red-50 text-red-600 hover:bg-red-100"
                >
                  退出登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="pt-1 pb-8">
        {loading ? null : !user ? (
          <Login />
        ) : (
          <>
            {view === 'library' && (
              <LibraryManager
                libraries={libraries}
                onLibrariesChange={handleLibrariesChange}
                onStartPractice={handleStartPractice}
                onStartReadSpeak={handleStartReadSpeak}
              />
            )}
            {view === 'practice' && (
              <PracticeMode
                libraries={libraries}
                onLibrariesChange={handleLibrariesChange}
                initialLibraryId={initialLibraryId}
                onLibraryIdUsed={() => setInitialLibraryId('')}
              />
            )}
            {view === 'read-speak' && (
              <ReadAndSpeakMode
                library={libraries.find(l => l.id === readSpeakLibraryId)}
                onBack={() => setView('library')}
              />
            )}
          </>
        )}
      </main>



      {/* 页脚 */}
      <footer className="mt-12 py-6 text-center text-gray-500 text-sm">
        <p>英语锻造坊 - 让学习更高效 ✨</p>
      </footer>
    </div>
  );
}

export default App;

