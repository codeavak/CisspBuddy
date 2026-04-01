import { QuizSession } from './types';

export const MIN_QUIZ_QUESTIONS = 1;
export const MAX_QUIZ_QUESTIONS = 10;

export const BASE_PROMPT = [
  "You are Johnny Avakian's CISSP Buddy, a focused CISSP study coach.",
  'Help the user understand CISSP concepts with clear, concise explanations that reflect the exam mindset.',
  'Follow the app turn instructions exactly, especially question numbering, when to reveal answers, and when to stop asking new questions.',
  'Each multiple-choice question must have exactly four options labeled A, B, C, and D with one best answer.',
  'When grading, explain the correct answer in CISSP terms and follow the distractor-review depth requested by the app instructions.',
  'Keep the tone encouraging, precise, and exam-focused.',
  'Prefer short sections and bullets over long essays.',
  'If the user gives a shorthand term, acronym, product code, or technology name that plausibly maps to a CISSP or defensive security concept, infer the most relevant security meaning first.',
  'Do not answer non-CISSP topics beyond a brief redirection back to CISSP study.',
  'Do not provide instructions for malware, credential theft, phishing, unauthorized access, evasion, or any offensive cyber misuse.',
  'If a prompt touches a sensitive security topic, keep the answer defensive, high level, and CISSP-oriented.'
].join(' ');

export const QUICK_PROMPTS = [
  'Explain due care vs due diligence and quiz me.',
  'Quiz me on security architecture and design.',
  'Explain business continuity planning and ask one question.',
  'Teach me least privilege with one CISSP-style question.'
];

export function buildLaunchPrompt(
  rawPrompt: string,
  startStudyRoundWhenEmpty: boolean
): string | undefined {
  const trimmedPrompt = rawPrompt.trim();

  if (trimmedPrompt.length > 0) {
    return trimmedPrompt;
  }

  if (startStudyRoundWhenEmpty) {
    return [
      'Start a CISSP study round.',
      'Pick a high-value CISSP topic, explain it simply, and then ask one exam-style multiple-choice question.'
    ].join(' ');
  }

  return undefined;
}

function buildDistractorInstruction(explainWrongAnswersInDetail: boolean): string[] {
  if (explainWrongAnswersInDetail) {
    return [
      'For each of the three wrong options, provide a dedicated explanation of why it is wrong in this scenario.',
      'Name each wrong option explicitly and explain the CISSP reasoning behind why it is weaker or incorrect.'
    ];
  }

  return ['Briefly explain why the other options are weaker.'];
}

export function buildQuizStartPrompt(
  topic: string,
  questionCount: number,
  explainWrongAnswersInDetail: boolean
): string {
  return [
    `Study topic: ${topic}`,
    '',
    'Respond as a CISSP study coach inside a polished VS Code app.',
    'If the topic is shorthand, an acronym, or a product name, interpret it in the most plausible CISSP or defensive security sense first.',
    `Explain the topic clearly first, then ask Question 1 of ${questionCount}.`,
    `The user has asked for a total of ${questionCount} question${questionCount === 1 ? '' : 's'} on this topic.`,
    explainWrongAnswersInDetail
      ? 'When grading later, explain each wrong option in detail.'
      : 'When grading later, a concise comparison of the wrong options is enough.',
    'Do not reveal the answer yet.',
    'End by instructing the user to reply with A, B, C, or D.',
    '',
    'Use this structure:',
    'Concept',
    `Question 1 of ${questionCount}`,
    'Options',
    'Reply prompt'
  ].join('\n');
}

export function buildQuizContinuationPrompt(
  answer: string,
  session: QuizSession,
  explainWrongAnswersInDetail: boolean
): string {
  const isFinalQuestion = session.currentQuestion >= session.totalQuestions;
  const nextQuestionNumber = session.currentQuestion + 1;
  const distractorInstruction = buildDistractorInstruction(explainWrongAnswersInDetail);
  const distractorHeading = explainWrongAnswersInDetail
    ? 'Why each wrong option is wrong'
    : 'Why the other options are weaker';

  if (isFinalQuestion) {
    return [
      `The user answered Question ${session.currentQuestion} of ${session.totalQuestions} with ${answer}.`,
      '',
      'Grade the answer first.',
      'Explain the correct answer in CISSP terms.',
      ...distractorInstruction,
      'Do not ask another question.',
      'End with a short session wrap-up containing exactly three key takeaways and a one-line quiz complete message.',
      '',
      'Use this structure:',
      'Answer Review',
      distractorHeading,
      'Three key takeaways',
      'Quiz complete'
    ].join('\n');
  }

  return [
    `The user answered Question ${session.currentQuestion} of ${session.totalQuestions} with ${answer}.`,
    '',
    'Grade the answer first.',
    'Explain the correct answer in CISSP terms.',
    ...distractorInstruction,
    `Then ask Question ${nextQuestionNumber} of ${session.totalQuestions}.`,
    'Do not reveal the new answer yet.',
    'End by instructing the user to reply with A, B, C, or D.',
    '',
    'Use this structure:',
    'Answer Review',
    distractorHeading,
    `Question ${nextQuestionNumber} of ${session.totalQuestions}`,
    'Options',
    'Reply prompt'
  ].join('\n');
}

export function buildLinkedInPostPrompt(topic: string): string {
  return [
    `Create a professional LinkedIn post about this CISSP or defensive security topic: ${topic}`,
    '',
    "Write in Johnny Avakian's voice as an engineer who built this as a serious CISSP study tool and a gift to candidates.",
    'Keep the post professional, credible, and substantive.',
    'Avoid emojis and hypey language.',
    'Aim for roughly 180 to 260 words.',
    'Include a strong opening hook, one compact paragraph of insight, and a closing call to action.',
    'Mention that Johnny is working on posting a CISSP prep blog on the website.',
    'Mention that stars on the CISSP Buddy repo and comments on the blog are appreciated.',
    'Mention that referrals for cybersecurity or senior engineer roles are welcome.',
    `Include these links naturally: ${'https://codeavak.github.io/portfolio_website/'} and ${'https://github.com/codeavak/cisspbuddy'}.`,
    'Return only the LinkedIn post text with clean spacing, ready to paste.'
  ].join('\n');
}
