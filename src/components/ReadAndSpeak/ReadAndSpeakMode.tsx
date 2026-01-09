import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Mic, ArrowLeft, Layers, AlignLeft, Square, Trash2 } from 'lucide-react';
import { VocabularyLibrary } from '../../types';

interface ReadAndSpeakModeProps {
    library?: VocabularyLibrary;
    onBack?: () => void;
}

export const ReadAndSpeakMode: React.FC<ReadAndSpeakModeProps> = ({ library, onBack }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [speed, setSpeed] = useState<number>(1.0);
    const [mode, setMode] = useState<'read' | 'shadow'>('read');
    const [viewMode, setViewMode] = useState<'paragraph' | 'sentence'>('paragraph');
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

    // Visual Feedback
    const [currentWordRange, setCurrentWordRange] = useState<{ start: number, length: number } | null>(null);

    const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
    const activeCardRef = useRef<HTMLDivElement | null>(null);
    const paragraphContainerRef = useRef<HTMLDivElement | null>(null);

    const synth = window.speechSynthesis;
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const autoPlayNextRef = useRef<boolean>(false);

    // Recording State
    const [recordings, setRecordings] = useState<{ [key: number]: string }>({});
    const [isRecording, setIsRecording] = useState(false);
    const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const audioChunksRef = useRef<Blob[]>([]);
    const [playingUserAudioIndex, setPlayingUserAudioIndex] = useState<number | null>(null);
    const userAudioRef = useRef<HTMLAudioElement | null>(null);

    const sentences = library?.items || [];

    // Cleanup
    useEffect(() => {
        return () => {
            synth.cancel();
        };
    }, []);

    // Scroll Logic
    useEffect(() => {
        if (viewMode === 'paragraph' && activeSentenceRef.current) {
            activeSentenceRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        } else if (viewMode === 'sentence' && activeCardRef.current) {
            activeCardRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }, [currentSentenceIndex, viewMode]);

    const stopAudio = () => {
        synth.cancel();
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentWordRange(null);
        autoPlayNextRef.current = false;
    };

    const playSentence = (index: number, autoNext: boolean = false) => {
        synth.cancel();

        if (index >= sentences.length) {
            stopAudio();
            return;
        }

        const textToSpeak = sentences[index].english;
        if (!textToSpeak) return;

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = speed;
        utterance.lang = 'en-US';

        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                const text = utterance.text;
                let end = text.indexOf(' ', event.charIndex + 1);
                if (end === -1) end = text.length;
                setCurrentWordRange({
                    start: event.charIndex,
                    length: end - event.charIndex
                });
            }
        };

        utterance.onend = () => {
            setCurrentWordRange(null);
            if (autoNext) {
                if (index < sentences.length - 1) {
                    const nextIdx = index + 1;
                    setCurrentSentenceIndex(nextIdx);
                    playSentence(nextIdx, true);
                } else {
                    stopAudio();
                    setCurrentSentenceIndex(0); // Reset to start
                }
            } else {
                setIsPlaying(false);
                setIsPaused(false);
            }
        };

        utterance.onerror = () => stopAudio();

        utteranceRef.current = utterance;
        synth.speak(utterance);

        setIsPlaying(true);
        setIsPaused(false);
        setCurrentSentenceIndex(index);
        autoPlayNextRef.current = autoNext;
    };

    const handlePlayPause = () => {
        if (isPlaying && !isPaused) {
            synth.pause();
            setIsPaused(true);
        } else if (isPlaying && isPaused) {
            synth.resume();
            setIsPaused(false);
        } else {
            // Default behavior: Read from current to end if in 'read' mode, else single sentence
            playSentence(currentSentenceIndex, mode === 'read');
        }
    };

    const handleNext = () => {
        stopAudio();
        if (currentSentenceIndex < sentences.length - 1) {
            setCurrentSentenceIndex(p => p + 1);
        }
    };

    const handlePrev = () => {
        stopAudio();
        if (currentSentenceIndex > 0) {
            setCurrentSentenceIndex(p => p - 1);
        }
    };

    const toggleMode = () => {
        stopAudio();
        const newMode = mode === 'read' ? 'shadow' : 'read';
        setMode(newMode);
        setViewMode(newMode === 'shadow' ? 'sentence' : 'paragraph');
    };

    // Recording Logic
    const startRecording = async (index: number) => {
        try {
            stopAudio(); // Stop any playback
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                setRecordings(prev => ({ ...prev, [index]: audioUrl }));

                // Stop all tracks to release mic
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingIndex(index);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please ensure permissions are granted.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setRecordingIndex(null);
        }
    };

    const playUserRecording = (index: number) => {
        // Stop any existing user audio
        if (userAudioRef.current) {
            userAudioRef.current.pause();
            userAudioRef.current = null;
            setPlayingUserAudioIndex(null);
        }

        const url = recordings[index];
        if (url) {
            stopAudio(); // Stop TTS
            const audio = new Audio(url);
            audio.onended = () => {
                userAudioRef.current = null;
                setPlayingUserAudioIndex(null);
            };
            userAudioRef.current = audio;
            audio.play();
            setPlayingUserAudioIndex(index);
        }
    };

    const stopUserPlayback = () => {
        if (userAudioRef.current) {
            userAudioRef.current.pause();
            userAudioRef.current = null;
            setPlayingUserAudioIndex(null);
        }
    };

    const deleteRecording = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setRecordings(prev => {
            const newRecordings = { ...prev };
            delete newRecordings[index];
            return newRecordings;
        });
    };

    // Helper: Word Highlighting
    const renderHighlightedText = (text: string, isCurrentSentence: boolean) => {
        if (!isCurrentSentence || !currentWordRange || !isPlaying || isPaused) {
            return text;
        }
        const { start, length } = currentWordRange;
        return (
            <>
                {text.slice(0, start)}
                <span className="text-red-600 font-extrabold mx-0.5">{text.slice(start, start + length)}</span>
                {text.slice(start + length)}
            </>
        );
    };

    // Immediate Speed Update
    useEffect(() => {
        if (isPlaying && !isPaused) {
            // Restart current sentence with new speed
            playSentence(currentSentenceIndex, mode === 'read');
        }
    }, [speed]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/button focused
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

            switch (e.code) {
                case 'Enter':
                    e.preventDefault();
                    handlePlayPause();
                    break;
                case 'ArrowDown':
                case 'ArrowRight': // Keep Right as secondary
                    e.preventDefault();
                    handleNext();
                    break;
                case 'ArrowUp':
                case 'ArrowLeft': // Keep Left as secondary
                    e.preventDefault();
                    handlePrev();
                    break;
                case 'AltLeft':
                case 'AltRight':
                    e.preventDefault();
                    toggleMode();
                    break;
                case 'Space':
                    e.preventDefault();
                    handlePlayPause();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    e.preventDefault();
                    if (mode === 'shadow') {
                        if (isRecording) {
                            stopRecording();
                        } else {
                            startRecording(currentSentenceIndex);
                        }
                    }
                    break;
                case 'ControlLeft':
                case 'ControlRight':
                    e.preventDefault();
                    if (mode === 'shadow' && recordings[currentSentenceIndex]) {
                        if (userAudioRef.current && !userAudioRef.current.paused) {
                            stopUserPlayback();
                        } else {
                            playUserRecording(currentSentenceIndex);
                        }
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSentenceIndex, isPlaying, isPaused, mode, isRecording, recordings]);

    if (!library) return null;

    return (
        <div className="max-w-full h-full min-h-screen flex flex-col bg-slate-100">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md shadow-sm px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{library.name}</h1>
                    </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('paragraph')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'paragraph' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        title="Paragraph View"
                    >
                        <AlignLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('sentence')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'sentence' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        title="Sentence View"
                    >
                        <Layers className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 p-4 md:p-8 flex justify-center items-start">
                <div className="w-full max-w-5xl pb-40">

                    {viewMode === 'paragraph' ? (
                        // Paragraph View
                        <div ref={paragraphContainerRef} className="bg-white rounded-[2rem] shadow-2xl border-[3px] border-indigo-100 p-10 md:p-16 leading-[2.2] text-2xl md:text-3xl text-gray-300 font-serif text-justify transition-all duration-500 min-h-[60vh] relative overflow-hidden">
                            {/* Decorative background accent */}
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-200 via-purple-200 to-indigo-200 opacity-50" />

                            {sentences.map((item, index) => {
                                const isActive = index === currentSentenceIndex;
                                return (
                                    <span
                                        key={item.id}
                                        ref={isActive ? activeSentenceRef : null}
                                        onClick={() => {
                                            stopAudio();
                                            setCurrentSentenceIndex(index);
                                        }}
                                        className={`cursor-pointer transition-colors duration-300 px-1 rounded-sm mx-0.5 ${isActive
                                            ? 'text-slate-900 font-medium'
                                            : 'hover:text-slate-400'
                                            }`}
                                    >
                                        {renderHighlightedText(item.english, isActive)}
                                        {" "}
                                    </span>
                                );
                            })}
                        </div>
                    ) : (
                        // Sentence View
                        <div className="space-y-6">
                            {sentences.map((item, index) => {
                                const isActive = index === currentSentenceIndex;
                                return (
                                    <div
                                        key={item.id}
                                        ref={isActive ? activeCardRef : null}
                                        onClick={() => {
                                            stopAudio();
                                            setCurrentSentenceIndex(index);
                                        }}
                                        className={`transition-all duration-300 p-8 rounded-2xl cursor-pointer bg-white border-2 ${isActive
                                            ? 'border-indigo-500 shadow-xl transform scale-[1.02] z-10'
                                            : 'border-transparent hover:border-indigo-200 shadow-md opacity-60 hover:opacity-90'
                                            }`}
                                    >
                                        <p className={`text-3xl font-medium leading-relaxed font-serif ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                                            {renderHighlightedText(item.english, isActive)}
                                        </p>
                                        {item.chinese && (
                                            <p className="mt-4 text-xl text-slate-500 font-light border-t border-slate-100 pt-4">
                                                {item.chinese}
                                            </p>
                                        )}

                                        {/* Recording Controls (Visible in Shadow Mode or if recording exists) */}
                                        {(mode === 'shadow' || recordings[index]) && (
                                            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-4" onClick={e => e.stopPropagation()}>
                                                {isRecording && recordingIndex === index ? (
                                                    <button
                                                        onClick={stopRecording}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 text-red-600 font-bold hover:bg-red-200 transition-colors animate-pulse"
                                                    >
                                                        <Square className="w-5 h-5 fill-current" />
                                                        Stop Recording
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => startRecording(index)}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                                                    >
                                                        <Mic className="w-5 h-5" />
                                                        {recordings[index] ? 'Re-record' : 'Record'}
                                                    </button>
                                                )}

                                                {recordings[index] && !isRecording && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                if (playingUserAudioIndex === index) {
                                                                    stopUserPlayback();
                                                                } else {
                                                                    playUserRecording(index);
                                                                }
                                                            }}
                                                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-colors ${playingUserAudioIndex === index
                                                                ? 'bg-indigo-600 text-white shadow-md'
                                                                : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                                                                }`}
                                                        >
                                                            {playingUserAudioIndex === index ? (
                                                                <>
                                                                    <Square className="w-5 h-5 fill-current" />
                                                                    Stop
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Play className="w-5 h-5 fill-current" />
                                                                    Play Check
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={(e) => deleteRecording(index, e)}
                                                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                                            title="Delete Recording"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            {/* Bottom Controls */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-6 shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-30">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative">

                    {/* Shortcuts Tooltip */}
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs md:text-sm py-2 px-6 rounded-full shadow-xl flex items-center gap-6 opacity-90 hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap border border-slate-700">
                        <span className="flex items-center gap-2"><span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-bold ring-1 ring-slate-600">ENTER</span> Start</span>
                        <span className="flex items-center gap-2"><span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-bold ring-1 ring-slate-600">↑/↓</span> Nav</span>
                        <span className="flex items-center gap-2"><span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-bold ring-1 ring-slate-600">ALT</span> Mode</span>
                        <span className="flex items-center gap-2"><span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-bold ring-1 ring-slate-600">SHIFT</span> Rec</span>
                        <span className="flex items-center gap-2"><span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-bold ring-1 ring-slate-600">CTRL</span> Play</span>
                    </div>

                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 w-full">

                        {/* Left: Speed & Progress */}
                        <div className="flex items-center gap-6 w-full md:w-auto justify-center md:justify-start">
                            <div className="flex items-center gap-3 bg-slate-100 rounded-xl px-5 py-4 border border-slate-200 shadow-sm">
                                <span className="text-slate-500 font-bold uppercase text-sm tracking-wider">Speed</span>
                                <div className="h-4 w-px bg-slate-300"></div>
                                <select
                                    value={speed}
                                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                    className="bg-transparent font-bold text-lg text-slate-700 cursor-pointer focus:outline-none"
                                >
                                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
                                        <option key={s} value={s}>{s}x</option>
                                    ))}
                                </select>
                            </div>

                            <div className="text-sm font-medium text-slate-400 font-mono">
                                <span className="text-slate-900 text-lg font-bold">{currentSentenceIndex + 1}</span> / {sentences.length}
                            </div>
                        </div>

                        {/* Center: Playback Controls */}
                        <div className="flex items-center gap-6">
                            <button
                                onClick={handlePrev}
                                disabled={currentSentenceIndex === 0}
                                className="p-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                                title="Previous (Left Arrow)"
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>

                            <button
                                onClick={handlePlayPause}
                                className={`flex items-center justify-center w-20 h-20 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 ${isPlaying && !isPaused
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    }`}
                                title="Play/Pause (Space)"
                            >
                                {isPlaying && !isPaused ? (
                                    <Pause className="w-10 h-10 fill-current" />
                                ) : (
                                    <Play className="w-10 h-10 fill-current ml-1" />
                                )}
                            </button>

                            <button
                                onClick={handleNext}
                                disabled={currentSentenceIndex === sentences.length - 1}
                                className="p-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                                title="Next (Right Arrow)"
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>
                        </div>

                        {/* Right: Mode & Repeat */}
                        <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-end">
                            <button
                                onClick={() => playSentence(currentSentenceIndex, false)}
                                className="flex items-center justify-center p-4 rounded-xl bg-slate-100 hover:bg-indigo-50 text-indigo-600 border-2 border-transparent hover:border-indigo-200 transition-all font-bold group"
                                title="Repeat Sentence (R / Enter)"
                            >
                                <RotateCcw className="w-6 h-6 group-hover:-rotate-90 transition-transform duration-500" />
                            </button>

                            <button
                                onClick={toggleMode}
                                className={`flex items-center gap-3 px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-md active:scale-95 ${mode === 'shadow'
                                    ? 'bg-purple-600 text-white shadow-purple-200 hover:bg-purple-700'
                                    : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                                    }`}
                            >
                                <Mic className={`w-6 h-6 ${mode === 'shadow' ? 'animate-pulse' : ''}`} />
                                {mode === 'read' ? 'Switch to Shadowing' : 'Shadowing Active'}
                            </button>
                        </div>
                    </div>

                    {/* Shortcuts Hint */}


                    {/* Shortcuts Hint - Removed redundant text since we have the tooltip now, or keep as fallback */}
                </div>
            </div>
        </div>
    );
};
