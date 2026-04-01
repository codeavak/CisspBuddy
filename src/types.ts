export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  kind?: 'message' | 'linkedinDraft';
  topic?: string;
}

export interface QuizSession {
  topic: string;
  totalQuestions: number;
  currentQuestion: number;
  sessionStartIndex: number;
  explainWrongAnswersInDetail: boolean;
  awaitingAnswer: boolean;
  completed: boolean;
}

export interface LinkedInDraft {
  topic: string;
  text: string;
  generatedAt: string;
}
