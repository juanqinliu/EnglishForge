export interface VocabularyItem {
  id: string;
  chinese: string;
  english: string;
  type: 'word' | 'sentence';
  createdAt: number;
}

export interface VocabularyLibrary {
  id: string;
  name: string;
  category?: 'dictation' | 'read-speak'; // Default to 'dictation' if undefined
  items: VocabularyItem[];
  createdAt: number;
  updatedAt?: number;
}

export interface PracticeResult {
  item: VocabularyItem;
  userAnswer: string;
  isCorrect: boolean;
  timestamp: number;
}

