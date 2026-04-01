export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  kind?: 'message' | 'linkedinDraft';
  topic?: string;
  imageAlt?: string;
  imagePlot?: string;
  visualSpec?: LinkedInVisualSpec;
}

export interface QuizSession {
  topic: string;
  totalQuestions: number;
  currentQuestion: number;
  correctAnswers: number;
  sessionStartIndex: number;
  explainWrongAnswersInDetail: boolean;
  awaitingAnswer: boolean;
  completed: boolean;
}

export interface LinkedInDraft {
  topic: string;
  text: string;
  generatedAt: string;
  imageAlt: string;
  imagePlot: string;
  visualSpec: LinkedInVisualSpec;
}

export type LinkedInVisualMotif =
  | 'shield'
  | 'network'
  | 'continuity'
  | 'identity'
  | 'governance'
  | 'data'
  | 'incident';

export interface LinkedInVisualPalette {
  backgroundStart: string;
  backgroundEnd: string;
  accent: string;
  highlight: string;
}

export interface LinkedInVisualSpec {
  eyebrow: string;
  headline: string;
  subheadline: string;
  keywords: string[];
  imagePlot: string;
  motif: LinkedInVisualMotif;
  palette: LinkedInVisualPalette;
}
