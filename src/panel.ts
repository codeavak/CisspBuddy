import * as vscode from 'vscode';

import {
  evaluatePrompt,
  getOutOfScopeResponse,
  isChoiceAnswer,
  isSecurityRelatedResponse
} from './guardrails';
import { createTranscriptPdf } from './pdf';
import {
  BASE_PROMPT,
  buildLinkedInGraphicPrompt,
  buildLinkedInPostPrompt,
  buildQuizContinuationPrompt,
  buildQuizStartPrompt,
  MAX_QUIZ_QUESTIONS,
  MIN_QUIZ_QUESTIONS,
  QUICK_PROMPTS
} from './prompts';
import { parseLinkedInVisualSpec } from './linkedinVisual';
import { LinkedInDraft, QuizSession, TranscriptEntry } from './types';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'acceptTerms' }
  | {
      type: 'submitPrompt';
      text: string;
      questionCount: number;
      detailedWrongAnswers: boolean;
    }
  | {
      type: 'quickPrompt';
      text: string;
      questionCount: number;
      detailedWrongAnswers: boolean;
    }
  | { type: 'setQuestionCount'; questionCount: number }
  | { type: 'setDetailedWrongAnswers'; enabled: boolean }
  | { type: 'generateLinkedInPost'; topic?: string }
  | { type: 'exportPdf' }
  | { type: 'resetTranscript' }
  | { type: 'openExternal'; url: string };

const BRAND_NAME = 'Johnny Avakian\'s CISSP Buddy';
const WEBSITE_URL = 'https://codeavak.github.io/portfolio_website/';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/codeavak';
const LINKEDIN_URL = 'https://www.linkedin.com/in/codeavak';
const REPO_URL = 'https://github.com/codeavak/cisspbuddy';
const ARCHITECTURE_DOC_URL = `${REPO_URL}/blob/master/docs/ARCHITECTURE.md`;
const LAUNCH_DOC_URL = `${REPO_URL}/blob/master/docs/LAUNCHING.md`;
const USER_GUIDE_DOC_URL = `${REPO_URL}/blob/master/docs/USER_GUIDE.md`;
const FAQ_DOC_URL = `${REPO_URL}/blob/master/docs/FAQ.md`;
const TROUBLESHOOTING_DOC_URL = `${REPO_URL}/blob/master/docs/TROUBLESHOOTING.md`;
const DEMO_SCRIPT_DOC_URL = `${REPO_URL}/blob/master/docs/DEMO_SCRIPT.md`;
const TERMS_VERSION = '2026-03-31-v2';
const TERMS_ACCEPTED_KEY = 'cisspBuddy.termsAccepted';
const TERMS_ACCEPTED_AT_KEY = 'cisspBuddy.termsAcceptedAt';
const TERMS_ACCEPTED_VERSION_KEY = 'cisspBuddy.termsAcceptedVersion';
const LEGAL_DISCLAIMER_LINES = [
  'Use of CISSP Buddy is completely at your own discretion.',
  'Johnny Avakian, CISSP Buddy, and all related contributors assume no liability for any misinformation, omissions, inaccuracies, outcomes, or decisions that arise from use of this software.',
  'For best results, use CISSP Buddy as a review companion and confirm knowledge through multiple CISSP study sources, official references, and your own judgment.',
  'By accepting, you acknowledge that this tool may be incomplete or mistaken and that you remain solely responsible for how you use any information it provides.'
];

interface PendingPrompt {
  prompt: string;
  questionCount: number;
  detailedWrongAnswers: boolean;
}

export class CisspBuddyPanel implements vscode.Disposable {
  private static currentPanel: CisspBuddyPanel | undefined;

  public static createOrShow(
    extensionUri: vscode.Uri,
    globalState: vscode.Memento
  ): CisspBuddyPanel {
    if (CisspBuddyPanel.currentPanel) {
      CisspBuddyPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return CisspBuddyPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'cisspBuddy.app',
      BRAND_NAME,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    CisspBuddyPanel.currentPanel = new CisspBuddyPanel(panel, extensionUri, globalState);
    return CisspBuddyPanel.currentPanel;
  }

  public static current(): CisspBuddyPanel | undefined {
    return CisspBuddyPanel.currentPanel;
  }

  public needsTermsAcceptance(): boolean {
    return !this.termsAccepted;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly extensionUri: vscode.Uri;
  private readonly globalState: vscode.Memento;
  private transcript: TranscriptEntry[] = [];
  private activeQuiz: QuizSession | undefined;
  private linkedinDraft: LinkedInDraft | undefined;
  private selectedQuestionCount = MIN_QUIZ_QUESTIONS;
  private selectedDetailedWrongAnswers = false;
  private lastStudyTopic: string | undefined;
  private isBusy = false;
  private busyLabel = '';
  private requestCancellation: vscode.CancellationTokenSource | undefined;
  private termsAccepted: boolean;
  private termsAcceptedAt: string | undefined;
  private pendingPrompt: PendingPrompt | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    globalState: vscode.Memento
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.globalState = globalState;
    const acceptedTermsVersion = this.globalState.get<string | undefined>(TERMS_ACCEPTED_VERSION_KEY);
    this.termsAccepted =
      Boolean(this.globalState.get<boolean>(TERMS_ACCEPTED_KEY, false)) &&
      acceptedTermsVersion === TERMS_VERSION;
    this.termsAcceptedAt = this.globalState.get<string | undefined>(TERMS_ACCEPTED_AT_KEY);
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'cissp-buddy-icon.png');
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.disposables.push(
      this.panel.onDidDispose(() => {
        CisspBuddyPanel.currentPanel = undefined;
        this.dispose();
      }),
      this.panel.webview.onDidReceiveMessage((message) => {
        void this.handleWebviewMessage(message as WebviewMessage);
      })
    );
  }

  public async ask(
    prompt: string,
    questionCount = this.selectedQuestionCount,
    detailedWrongAnswers = this.selectedDetailedWrongAnswers
  ): Promise<void> {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      return;
    }

    if (this.isBusy) {
      await vscode.window.showWarningMessage(
        `${BRAND_NAME} is finishing the current response. Please try again in a moment.`
      );
      return;
    }

    this.panel.reveal(vscode.ViewColumn.Beside);
    this.selectedQuestionCount = clampQuestionCount(questionCount);
    this.selectedDetailedWrongAnswers = detailedWrongAnswers;

    if (!this.termsAccepted) {
      this.pendingPrompt = {
        prompt: trimmedPrompt,
        questionCount: this.selectedQuestionCount,
        detailedWrongAnswers: this.selectedDetailedWrongAnswers
      };
      this.postState();
      await vscode.window.showInformationMessage(
        `Review and accept the ${BRAND_NAME} terms before starting your first study session.`
      );
      return;
    }

    if (isChoiceAnswer(trimmedPrompt)) {
      await this.handleQuizAnswer(trimmedPrompt);
      return;
    }

    await this.handleTopicPrompt(trimmedPrompt);
  }

  public async exportTranscript(): Promise<void> {
    if (this.transcript.length === 0) {
      await vscode.window.showInformationMessage(
        `Start a ${BRAND_NAME} session before exporting a PDF.`
      );
      return;
    }

    const suggestedName = `johnny-avakian-presents-cissp-buddy-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)}.pdf`;

    const baseFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const targetUri = await vscode.window.showSaveDialog({
      defaultUri: baseFolder ? vscode.Uri.joinPath(baseFolder, suggestedName) : undefined,
      filters: {
        PDF: ['pdf']
      }
    });

    if (!targetUri) {
      return;
    }

    await vscode.workspace.fs.writeFile(targetUri, createTranscriptPdf(this.transcript));
    await vscode.window.showInformationMessage(`Transcript exported to ${targetUri.fsPath}`);
  }

  public dispose(): void {
    this.requestCancellation?.cancel();
    this.requestCancellation?.dispose();

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    if (!this.termsAccepted && message.type !== 'ready' && message.type !== 'acceptTerms' && message.type !== 'openExternal') {
      this.postState();
      return;
    }

    switch (message.type) {
      case 'ready':
        this.postState();
        return;
      case 'acceptTerms':
        await this.acceptTerms();
        return;
      case 'submitPrompt':
      case 'quickPrompt':
        await this.ask(message.text, message.questionCount, message.detailedWrongAnswers);
        return;
      case 'setQuestionCount':
        this.selectedQuestionCount = clampQuestionCount(message.questionCount);
        this.postState();
        return;
      case 'setDetailedWrongAnswers':
        this.selectedDetailedWrongAnswers = message.enabled;
        if (this.activeQuiz && !this.activeQuiz.completed) {
          this.activeQuiz = {
            ...this.activeQuiz,
            explainWrongAnswersInDetail: message.enabled
          };
        }
        this.postState();
        return;
      case 'generateLinkedInPost':
        await this.generateLinkedInPost(message.topic);
        return;
      case 'exportPdf':
        await this.exportTranscript();
        return;
      case 'resetTranscript':
        await this.resetTranscript();
        return;
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      default:
        return;
    }
  }

  private async handleTopicPrompt(topic: string): Promise<void> {
    const guardrailOutcome = evaluatePrompt(topic, this.transcript);
    this.transcript.push(this.createEntry('user', topic));
    this.postState();

    if (!guardrailOutcome.allowed) {
      this.appendAssistantMessage(
        guardrailOutcome.response ?? `That request is out of scope for ${BRAND_NAME}.`
      );
      return;
    }

    const sessionStartIndex = this.transcript.length - 1;
    const pendingQuiz: QuizSession = {
      topic,
      totalQuestions: this.selectedQuestionCount,
      currentQuestion: 1,
      correctAnswers: 0,
      sessionStartIndex,
      explainWrongAnswersInDetail: this.selectedDetailedWrongAnswers,
      awaitingAnswer: true,
      completed: false
    };

    const assistantEntry = this.createEntry('assistant', '');
    this.transcript.push(assistantEntry);
    this.postState();

    const messages = [
      vscode.LanguageModelChatMessage.User(BASE_PROMPT),
      vscode.LanguageModelChatMessage.User(
        buildQuizStartPrompt(
          topic,
          pendingQuiz.totalQuestions,
          pendingQuiz.explainWrongAnswersInDetail
        )
      )
    ];

    const succeeded = await this.streamModelResponse(
      messages,
      assistantEntry,
      `Preparing question 1 of ${pendingQuiz.totalQuestions}...`
    );

    if (!succeeded) {
      this.postState();
      return;
    }

    if (
      guardrailOutcome.requiresResponseValidation &&
      !isSecurityRelatedResponse(assistantEntry.text)
    ) {
      assistantEntry.text = getOutOfScopeResponse();
      this.postState();
      return;
    }

    const quizKickoffValidationMessage = this.getQuizKickoffValidationMessage(
      topic,
      assistantEntry.text,
      pendingQuiz.totalQuestions
    );
    if (quizKickoffValidationMessage) {
      assistantEntry.text = quizKickoffValidationMessage;
      this.postState();
      return;
    }

    this.activeQuiz = pendingQuiz;
    this.lastStudyTopic = topic;
    this.postState();
  }

  private async handleQuizAnswer(answer: string): Promise<void> {
    this.transcript.push(this.createEntry('user', answer.toUpperCase()));
    this.postState();

    if (!this.activeQuiz || !this.activeQuiz.awaitingAnswer) {
      this.appendAssistantMessage(
        'There is no active quiz question waiting for an answer. Start a topic first, then answer with A, B, C, or D.'
      );
      return;
    }

    const currentQuiz = { ...this.activeQuiz };
    const history = this.buildSessionHistory(
      currentQuiz.sessionStartIndex,
      this.transcript.length - 1
    );

    const assistantEntry = this.createEntry('assistant', '');
    this.transcript.push(assistantEntry);
    this.postState();

    const messages = [
      vscode.LanguageModelChatMessage.User(BASE_PROMPT),
      ...history,
      vscode.LanguageModelChatMessage.User(
        buildQuizContinuationPrompt(
          answer,
          currentQuiz,
          currentQuiz.explainWrongAnswersInDetail
        )
      )
    ];

    const isFinalQuestion = currentQuiz.currentQuestion >= currentQuiz.totalQuestions;
    const succeeded = await this.streamModelResponse(
      messages,
      assistantEntry,
      isFinalQuestion
        ? `Reviewing the final answer for question ${currentQuiz.currentQuestion}...`
        : `Reviewing answer and preparing question ${currentQuiz.currentQuestion + 1} of ${currentQuiz.totalQuestions}...`
    );

    if (!succeeded) {
      this.postState();
      return;
    }

    const wasCorrect = extractQuizResult(assistantEntry.text);
    const updatedCorrectAnswers = currentQuiz.correctAnswers + (wasCorrect ? 1 : 0);

    if (isFinalQuestion) {
      assistantEntry.text = enforceFinalScoreLine(
        assistantEntry.text,
        updatedCorrectAnswers,
        currentQuiz.totalQuestions
      );
      this.activeQuiz = {
        ...currentQuiz,
        correctAnswers: updatedCorrectAnswers,
        awaitingAnswer: false,
        completed: true
      };
    } else {
      this.activeQuiz = {
        ...currentQuiz,
        currentQuestion: currentQuiz.currentQuestion + 1,
        correctAnswers: updatedCorrectAnswers,
        awaitingAnswer: true,
        completed: false
      };
    }

    this.postState();
  }

  private async generateLinkedInPost(topicCandidate?: string): Promise<void> {
    if (this.isBusy) {
      await vscode.window.showWarningMessage(
        `Wait for ${BRAND_NAME} to finish the current task before generating a LinkedIn post.`
      );
      return;
    }

    if (this.activeQuiz?.awaitingAnswer) {
      await vscode.window.showInformationMessage(
        'A quiz is in progress. Type your answer to the current question with A, B, C, or D before generating a LinkedIn post.'
      );
      return;
    }

    const resolvedTopic = this.resolveLinkedInTopic(topicCandidate);
    if (!resolvedTopic) {
      await vscode.window.showInformationMessage(
        'Enter a CISSP topic in the composer, or complete a quiz topic first, before generating a LinkedIn post.'
      );
      return;
    }

    const guardrailOutcome = evaluatePrompt(resolvedTopic, this.transcript);
    if (!guardrailOutcome.allowed) {
      await vscode.window.showWarningMessage(
        guardrailOutcome.response ??
          'The selected topic is out of scope for the LinkedIn post generator.'
      );
      return;
    }

    const messages = [
      vscode.LanguageModelChatMessage.User(BASE_PROMPT),
      vscode.LanguageModelChatMessage.User(buildLinkedInPostPrompt(resolvedTopic))
    ];

    const draftText = await this.captureModelResponse(
      messages,
      'Drafting a professional LinkedIn post...'
    );

    if (!draftText) {
      this.postState();
      return;
    }

    if (
      guardrailOutcome.requiresResponseValidation &&
      !isSecurityRelatedResponse(draftText)
    ) {
      await vscode.window.showWarningMessage(
        'That topic did not resolve to a CISSP or defensive security concept for the LinkedIn draft.'
      );
      this.postState();
      return;
    }

    const visualSpecResponse = await this.captureModelResponse(
      [
        vscode.LanguageModelChatMessage.User(BASE_PROMPT),
        vscode.LanguageModelChatMessage.User(buildLinkedInGraphicPrompt(resolvedTopic, draftText))
      ],
      'Designing a topic-specific LinkedIn graphic...'
    );
    const visualSpec = parseLinkedInVisualSpec(visualSpecResponse, resolvedTopic);

    this.linkedinDraft = {
      topic: resolvedTopic,
      text: draftText,
      generatedAt: new Date().toLocaleString(),
      imageAlt: `Topic-specific LinkedIn graphic for ${resolvedTopic}`,
      imagePlot: visualSpec.imagePlot,
      visualSpec
    };
    this.transcript.push(this.createLinkedInDraftEntry(this.linkedinDraft));

    this.postState();
  }

  private async resetTranscript(): Promise<void> {
    if (this.isBusy) {
      await vscode.window.showWarningMessage(
        `Wait for the current response to finish before starting a new ${BRAND_NAME} session.`
      );
      return;
    }

    this.transcript = [];
    this.activeQuiz = undefined;
    this.linkedinDraft = undefined;
    this.lastStudyTopic = undefined;
    this.postState();
  }

  private async acceptTerms(): Promise<void> {
    if (this.termsAccepted) {
      this.postState();
      return;
    }

    const acceptedAtIso = new Date().toISOString();
    this.termsAccepted = true;
    this.termsAcceptedAt = new Date(acceptedAtIso).toLocaleString();

    await this.globalState.update(TERMS_ACCEPTED_KEY, true);
    await this.globalState.update(TERMS_ACCEPTED_AT_KEY, acceptedAtIso);
    await this.globalState.update(TERMS_ACCEPTED_VERSION_KEY, TERMS_VERSION);
    this.postState();

    const pendingPrompt = this.pendingPrompt;
    this.pendingPrompt = undefined;

    if (pendingPrompt) {
      await this.ask(
        pendingPrompt.prompt,
        pendingPrompt.questionCount,
        pendingPrompt.detailedWrongAnswers
      );
      return;
    }

    await vscode.window.showInformationMessage(
      `The ${BRAND_NAME} terms have been accepted. You can begin studying now.`
    );
  }

  private resolveLinkedInTopic(topicCandidate?: string): string | undefined {
    if (this.activeQuiz?.topic) {
      return this.activeQuiz.topic;
    }

    if (this.lastStudyTopic) {
      return this.lastStudyTopic;
    }

    const explicitTopic = topicCandidate?.trim();
    if (explicitTopic) {
      return explicitTopic;
    }

    return undefined;
  }

  private buildSessionHistory(
    sessionStartIndex: number,
    endExclusive: number
  ): vscode.LanguageModelChatMessage[] {
    return this.transcript
      .slice(sessionStartIndex, endExclusive)
      .filter((entry) => entry.text.trim().length > 0)
      .map((entry) =>
        entry.role === 'user'
          ? vscode.LanguageModelChatMessage.User(entry.text)
          : vscode.LanguageModelChatMessage.Assistant(entry.text)
      );
  }

  private createEntry(role: TranscriptEntry['role'], text: string): TranscriptEntry {
    return {
      kind: 'message',
      role,
      text,
      timestamp: new Date().toLocaleString()
    };
  }

  private createLinkedInDraftEntry(draft: LinkedInDraft): TranscriptEntry {
    return {
      kind: 'linkedinDraft',
      role: 'assistant',
      text: draft.text,
      timestamp: draft.generatedAt,
      topic: draft.topic,
      imageAlt: draft.imageAlt,
      imagePlot: draft.imagePlot,
      visualSpec: draft.visualSpec
    };
  }

  private appendAssistantMessage(text: string): void {
    this.transcript.push(this.createEntry('assistant', text));
    this.postState();
  }

  private getQuizKickoffValidationMessage(
    topic: string,
    responseText: string,
    questionCount: number
  ): string | undefined {
    if (looksLikeQuizKickoffResponse(responseText, questionCount)) {
      return undefined;
    }

    return [
      `I could not turn "${topic}" into a clean CISSP study round yet.`,
      '',
      'Try asking again with a little more context, such as "Explain this for CISSP and quiz me."'
    ].join('\n');
  }

  private async streamModelResponse(
    messages: vscode.LanguageModelChatMessage[],
    assistantEntry: TranscriptEntry,
    busyLabel: string
  ): Promise<boolean> {
    try {
      this.isBusy = true;
      this.busyLabel = busyLabel;
      this.postState();

      const model = await this.selectModel();
      this.requestCancellation = new vscode.CancellationTokenSource();
      const response = await model.sendRequest(messages, {}, this.requestCancellation.token);

      for await (const fragment of response.text) {
        assistantEntry.text += fragment;
        this.postState();
      }

      if (assistantEntry.text.trim().length === 0) {
        assistantEntry.text =
          `${BRAND_NAME} did not receive a response from the model. Please try that topic again.`;
      }

      return true;
    } catch (error) {
      assistantEntry.text = this.toErrorMessage(error);
      return false;
    } finally {
      this.isBusy = false;
      this.busyLabel = '';
      this.requestCancellation?.dispose();
      this.requestCancellation = undefined;
      this.postState();
    }
  }

  private async captureModelResponse(
    messages: vscode.LanguageModelChatMessage[],
    busyLabel: string
  ): Promise<string | undefined> {
    try {
      this.isBusy = true;
      this.busyLabel = busyLabel;
      this.postState();

      const model = await this.selectModel();
      this.requestCancellation = new vscode.CancellationTokenSource();
      const response = await model.sendRequest(messages, {}, this.requestCancellation.token);

      let output = '';
      for await (const fragment of response.text) {
        output += fragment;
      }

      return output.trim().length > 0 ? output.trim() : undefined;
    } catch (error) {
      await vscode.window.showErrorMessage(this.toErrorMessage(error));
      return undefined;
    } finally {
      this.isBusy = false;
      this.busyLabel = '';
      this.requestCancellation?.dispose();
      this.requestCancellation = undefined;
      this.postState();
    }
  }

  private async selectModel(): Promise<vscode.LanguageModelChat> {
    const selectors = [
      { vendor: 'copilot', family: 'gpt-4o-mini' },
      { vendor: 'copilot', family: 'gpt-4o' },
      { vendor: 'copilot' }
    ];

    for (const selector of selectors) {
      const models = await vscode.lm.selectChatModels(selector);
      if (models.length > 0) {
        return models[0];
      }
    }

    throw new Error(
      'No GitHub Copilot chat model is available. Make sure Copilot Chat is installed and signed in.'
    );
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof vscode.LanguageModelError) {
      return [
        `${BRAND_NAME} could not reach the selected chat model.`,
        '',
        `Error: ${error.message}`
      ].join('\n');
    }

    if (error instanceof Error) {
      return [
        `${BRAND_NAME} hit an unexpected error while preparing your study round.`,
        '',
        `Error: ${error.message}`
      ].join('\n');
    }

    return `${BRAND_NAME} hit an unexpected error while preparing your study round.`;
  }

  private postState(): void {
    void this.panel.webview.postMessage({
      type: 'state',
      payload: {
        activeQuiz: this.activeQuiz,
        busyLabel: this.busyLabel,
        isBusy: this.isBusy,
        legalDisclaimerLines: LEGAL_DISCLAIMER_LINES,
        linkedinDraft: this.linkedinDraft,
        pendingPromptTopic: this.pendingPrompt?.prompt,
        quickPrompts: QUICK_PROMPTS,
        selectedDetailedWrongAnswers: this.selectedDetailedWrongAnswers,
        selectedQuestionCount: this.selectedQuestionCount,
        termsAccepted: this.termsAccepted,
        termsAcceptedAt: formatAcceptedAt(this.termsAcceptedAt),
        transcript: this.transcript
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const bannerUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'cissp-buddy-logo.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Johnny Avakian's CISSP Buddy</title>
    <style nonce="${nonce}">
      :root {
        color-scheme: light dark;
        --page: var(--vscode-editor-background);
        --ink: var(--vscode-editor-foreground);
        --muted: var(--vscode-descriptionForeground);
        --surface: rgba(10, 22, 36, 0.94);
        --surface-soft: rgba(16, 33, 52, 0.94);
        --surface-hero: rgba(11, 28, 46, 0.96);
        --border: rgba(216, 177, 92, 0.24);
        --gold: #d8b15c;
        --gold-dark: #b47a16;
        --user: rgba(145, 96, 12, 0.92);
        --assistant: rgba(18, 41, 65, 0.94);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top right, rgba(216, 177, 92, 0.18), transparent 32%),
          linear-gradient(180deg, rgba(7, 24, 42, 0.36), transparent 30%),
          var(--page);
        color: var(--ink);
        font-family: "Segoe UI Variable Text", "Segoe UI", sans-serif;
      }

      a {
        color: inherit;
      }

      .shell {
        width: min(1080px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 320px;
      }

      .legal-ribbon {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        padding: 14px 18px;
        margin-bottom: 16px;
        border-radius: 20px;
        border: 1px solid rgba(216, 177, 92, 0.28);
        background:
          linear-gradient(135deg, rgba(216, 177, 92, 0.14), transparent 45%),
          linear-gradient(180deg, rgba(20, 27, 41, 0.96), rgba(11, 18, 29, 0.98));
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);
      }

      .legal-ribbon__body {
        display: grid;
        gap: 4px;
      }

      .legal-ribbon__eyebrow {
        margin: 0;
        color: var(--gold);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 11px;
      }

      .legal-ribbon__text {
        margin: 0;
        color: var(--ink);
        line-height: 1.55;
        font-size: 14px;
      }

      .legal-ribbon__pill {
        flex-shrink: 0;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(216, 177, 92, 0.22);
        background: rgba(216, 177, 92, 0.08);
        color: var(--gold);
        white-space: nowrap;
        font-size: 12px;
      }

      .hero,
      .legal,
      .promo,
      .creator,
      .docs,
      .composer,
      .message__bubble,
      .empty-state {
        border: 1px solid var(--border);
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
      }

      .hero,
      .legal,
      .promo,
      .creator,
      .docs,
      .composer,
      .message__bubble,
      .empty-state {
        border-radius: 24px;
      }

      .hero {
        overflow: hidden;
        padding: 28px;
        border-radius: 24px;
        background:
          linear-gradient(135deg, rgba(216, 177, 92, 0.18), transparent 55%),
          linear-gradient(180deg, rgba(12, 34, 54, 0.92), var(--surface-hero));
      }

      .hero__brand {
        display: grid;
        gap: 22px;
        align-items: start;
      }

      .hero__logo {
        width: min(100%, 620px);
        height: auto;
        display: block;
        border-radius: 28px;
        box-shadow: 0 16px 30px rgba(0, 0, 0, 0.24);
      }

      .hero__copy {
        max-width: 820px;
      }

      .hero__eyebrow,
      .section__eyebrow {
        margin: 0 0 10px;
        color: var(--gold);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 11px;
      }

      .hero__title {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(30px, 5vw, 44px);
        line-height: 1.05;
      }

      .hero__subtitle,
      .section__body {
        line-height: 1.65;
        color: var(--muted);
      }

      .hero__subtitle {
        max-width: 780px;
        margin: 12px 0 18px;
      }

      .hero__guardrail {
        margin: 18px 0 18px;
        font-size: 13px;
        color: var(--gold);
        letter-spacing: 0.04em;
      }

      .quick-prompts,
      .legal__actions,
      .promo__actions,
      .creator__actions,
      .docs__actions,
      .toolbar,
      .composer__actions,
      .composer__actions-right {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .stack {
        display: grid;
        gap: 18px;
        margin-top: 18px;
      }

      .legal {
        padding: 22px 24px;
        background:
          linear-gradient(135deg, rgba(216, 177, 92, 0.1), transparent 45%),
          linear-gradient(180deg, rgba(20, 27, 41, 0.94), rgba(11, 18, 29, 0.96));
      }

      .legal__header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .legal__list {
        margin: 14px 0 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.7;
      }

      .legal__meta {
        margin-top: 12px;
        color: var(--gold);
        font-size: 13px;
      }

      .legal__status {
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid rgba(216, 177, 92, 0.24);
        background: rgba(216, 177, 92, 0.08);
        color: var(--gold);
        white-space: nowrap;
        font-size: 12px;
      }

      .terms-modal {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(3, 8, 14, 0.78);
        backdrop-filter: blur(8px);
      }

      .terms-modal[hidden] {
        display: none;
      }

      .terms-modal__card {
        width: min(760px, 100%);
        border-radius: 28px;
        border: 1px solid rgba(216, 177, 92, 0.28);
        background:
          linear-gradient(145deg, rgba(22, 35, 52, 0.98), rgba(11, 20, 31, 0.98));
        box-shadow: 0 28px 60px rgba(0, 0, 0, 0.4);
        padding: 26px 28px;
      }

      .terms-modal__title {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(28px, 5vw, 36px);
        line-height: 1.1;
      }

      .terms-modal__body {
        margin: 14px 0 0;
        color: var(--muted);
        line-height: 1.7;
      }

      .terms-modal__list {
        margin: 16px 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.8;
      }

      .terms-modal__checkbox {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        margin-top: 16px;
        color: var(--ink);
        line-height: 1.6;
      }

      .terms-modal__checkbox input {
        margin-top: 4px;
        width: 18px;
        height: 18px;
        accent-color: var(--gold-dark);
      }

      .terms-modal__hint {
        margin-top: 12px;
        color: var(--gold);
        font-size: 13px;
        line-height: 1.6;
      }

      .two-up {
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: 18px;
      }

      button {
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      }

      button:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: default;
        opacity: 0.55;
      }

      .button--ghost {
        color: var(--ink);
        background: rgba(255, 255, 255, 0.03);
        border-color: var(--border);
      }

      .button--primary {
        color: #1e1200;
        background: linear-gradient(135deg, #e5cb89, #c58718);
      }

      .button--prompt {
        color: var(--ink);
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.08);
      }

      .button--secondary {
        color: var(--ink);
        background: rgba(216, 177, 92, 0.08);
        border-color: rgba(216, 177, 92, 0.28);
      }

      select,
      textarea {
        font: inherit;
      }

      .transcript {
        display: grid;
        gap: 16px;
        margin: 22px 0 26px;
      }

      .promo,
      .creator,
      .docs {
        padding: 22px 24px;
        background:
          linear-gradient(135deg, rgba(216, 177, 92, 0.12), transparent 48%),
          linear-gradient(180deg, rgba(15, 33, 49, 0.92), rgba(9, 22, 36, 0.94));
      }

      .promo {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 18px;
        align-items: center;
      }

      .section__title {
        margin: 0 0 10px;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(22px, 3vw, 28px);
        line-height: 1.2;
      }

      .promo__actions {
        justify-content: flex-end;
      }

      .creator__draft {
        width: 100%;
        min-height: 220px;
        resize: vertical;
        margin-top: 14px;
        border: 1px solid rgba(216, 177, 92, 0.18);
        border-radius: 18px;
        padding: 16px 18px;
        background: rgba(10, 21, 34, 0.9);
        color: inherit;
        line-height: 1.6;
      }

      .creator__meta,
      .quiz-summary,
      .composer__status {
        color: var(--muted);
        font-size: 13px;
      }

      .docs__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-top: 16px;
      }

      .docs__card {
        padding: 18px;
        border: 1px solid rgba(216, 177, 92, 0.16);
        border-radius: 20px;
        background: rgba(11, 23, 36, 0.62);
      }

      .docs__card h3 {
        margin: 0 0 10px;
        font-size: 16px;
      }

      .docs__card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .docs__code {
        margin: 10px 0 0;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(6, 14, 23, 0.9);
        color: #f8e4af;
        white-space: pre-wrap;
        font-family: Consolas, "Courier New", monospace;
        font-size: 13px;
      }

      .empty-state {
        padding: 24px;
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(16, 32, 49, 0.82), rgba(10, 22, 36, 0.92));
      }

      .empty-state h2 {
        margin: 0 0 8px;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 24px;
      }

      .empty-state p {
        margin: 0 0 18px;
        color: var(--muted);
        line-height: 1.6;
      }

      .message {
        display: flex;
        justify-content: flex-start;
      }

      .message--user {
        justify-content: flex-end;
      }

      .message__bubble {
        width: min(100%, 780px);
        border-radius: 24px;
        padding: 18px 20px;
        background: var(--assistant);
      }

      .message--user .message__bubble {
        background: var(--user);
        color: var(--vscode-button-foreground);
      }

      .message__meta {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
        font-size: 12px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .message__role {
        font-weight: 700;
      }

      .message__content {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.65;
        font-family: "Segoe UI Variable Text", "Segoe UI", sans-serif;
      }

      .message__linkedin {
        display: grid;
        gap: 16px;
      }

      .message__linkedin-visual {
        width: min(100%, 620px);
        height: auto;
        display: block;
        border-radius: 22px;
        border: 1px solid rgba(216, 177, 92, 0.18);
      }

      .message__linkedin-title {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(24px, 4vw, 32px);
        line-height: 1.15;
      }

      .message__linkedin-topic {
        margin: 0;
        color: var(--gold);
        font-size: 13px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .message__plot {
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(216, 177, 92, 0.18);
        background: rgba(7, 17, 28, 0.58);
      }

      .message__plot-title {
        margin: 0 0 8px;
        color: var(--gold);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .composer-dock {
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        width: min(1080px, calc(100vw - 32px));
        pointer-events: none;
        z-index: 30;
      }

      .composer {
        position: relative;
        pointer-events: auto;
        width: min(520px, 100%);
        margin-left: auto;
        padding: 18px;
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(11, 24, 39, 0.94), rgba(8, 18, 30, 0.96)),
          var(--surface);
        max-height: calc(100vh - 32px);
        overflow: auto;
        transition: width 140ms ease, transform 140ms ease, box-shadow 140ms ease;
      }

      .composer--collapsed {
        width: min(360px, 100%);
        padding: 16px 18px;
      }

      .composer--collapsed .composer__body {
        display: none;
      }

      .composer--collapsed .composer__topline {
        margin-bottom: 0;
        align-items: flex-start;
      }

      .composer--collapsed .composer__status {
        max-width: 240px;
      }

      .composer__topline {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 12px;
      }

      .composer__headline {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      .composer__label {
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--gold);
      }

      .composer__toggle {
        flex-shrink: 0;
      }

      .composer__body {
        display: grid;
        gap: 12px;
      }

      .composer__controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .composer__control {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .composer__control label {
        color: var(--muted);
        font-size: 13px;
      }

      .composer__checkbox {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 13px;
      }

      .composer__checkbox input {
        width: 16px;
        height: 16px;
        accent-color: var(--gold-dark);
      }

      .composer__control select {
        min-width: 88px;
        border: 1px solid rgba(216, 177, 92, 0.24);
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(10, 22, 36, 0.88);
        color: inherit;
      }

      textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
        border: 1px solid rgba(216, 177, 92, 0.18);
        border-radius: 18px;
        padding: 16px 18px;
        background: var(--surface-soft);
        color: inherit;
        font: inherit;
        line-height: 1.55;
      }

      textarea:focus,
      select:focus {
        outline: 2px solid rgba(216, 177, 92, 0.35);
        outline-offset: 2px;
      }

      .composer__actions {
        justify-content: space-between;
        margin-top: 14px;
      }

      @media (max-width: 900px) {
        .two-up,
        .promo,
        .docs__grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: calc(100vw - 20px);
          padding-top: 16px;
          padding-bottom: 220px;
        }

        .hero,
        .promo,
        .creator,
        .docs,
        .composer,
        .message__bubble,
        .empty-state {
          border-radius: 20px;
        }

        .hero__brand,
        .promo {
          grid-template-columns: 1fr;
        }

        .composer-dock {
          width: calc(100vw - 20px);
          bottom: 10px;
        }

        .composer,
        .composer--collapsed {
          width: 100%;
        }

        .composer__topline,
        .composer__actions {
          display: grid;
          gap: 12px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="legal-ribbon" aria-label="Legal notice summary">
        <div class="legal-ribbon__body">
          <p class="legal-ribbon__eyebrow">Legal Notice</p>
          <p id="legalRibbonText" class="legal-ribbon__text">
            Use CISSP Buddy at your own discretion. No liability is assumed, and important topics should be confirmed with multiple CISSP study sources.
          </p>
        </div>
        <div id="legalRibbonPill" class="legal-ribbon__pill">Acceptance Required</div>
      </section>

      <section class="hero">
        <div class="hero__brand">
          <img class="hero__logo" src="${bannerUri}" alt="CISSP Buddy app logo" />
          <div class="hero__copy">
            <p class="hero__eyebrow">Study Better For CISSP</p>
            <h1 class="hero__title">Clear explanations, disciplined practice, and smarter preparation.</h1>
            <p class="hero__subtitle">
              Built to help CISSP candidates study better, think more clearly, and succeed.
              Learn the topic, take a guided multi-question quiz, export your study notes,
              and turn completed topics into thoughtful LinkedIn posts when you want to share
              what you learned.
            </p>
          </div>
        </div>
        <p class="hero__guardrail">
          Defensive-only, CISSP-scoped, and built to help candidates study with clarity, discipline, and confidence.
        </p>
        <div id="quickPrompts" class="quick-prompts"></div>
      </section>

      <div class="stack">
        <section class="legal">
          <div class="legal__header">
            <div>
              <p class="section__eyebrow">Legal Notice</p>
              <h2 class="section__title">Use this study tool as a review companion, not as your only source of truth.</h2>
            </div>
            <div id="legalStatus" class="legal__status">Acceptance Required</div>
          </div>
          <ul id="legalSummary" class="legal__list"></ul>
          <div id="legalMeta" class="legal__meta">
            Acceptance is required before your first study session.
          </div>
        </section>

        <section class="promo">
          <div>
            <p class="section__eyebrow">Website, Support, Mission, And Referrals</p>
            <h2 class="section__title">
              Built as a gift to CISSP candidates who want to study smarter and succeed.
            </h2>
            <p class="section__body">
              Johnny is working on posting a CISSP prep blog on the website. Stars on the
              CISSP Buddy repo, comments on the blog, and support through Buy Me a Coffee are
              deeply appreciated, and referrals for cybersecurity or senior engineer roles are
              always welcome.
            </p>
          </div>
          <div class="promo__actions">
            <button class="button--secondary" type="button" data-external-url="${WEBSITE_URL}">
              Website
            </button>
            <button class="button--secondary" type="button" data-external-url="${BUY_ME_A_COFFEE_URL}">
              Support CISSP Buddy
            </button>
            <button class="button--secondary" type="button" data-external-url="${LINKEDIN_URL}">
              LinkedIn
            </button>
            <button class="button--secondary" type="button" data-external-url="${REPO_URL}">
              Star The Repo
            </button>
          </div>
        </section>

        <div class="two-up">
          <section class="creator">
            <p class="section__eyebrow">LinkedIn Draft</p>
            <h2 class="section__title">Generate a post, topic image, and image plot directly in the answer area.</h2>
            <p class="section__body">
              This uses the last CISSP topic you studied, or the composer topic if you have not
              started a study session yet, then places the generated post, a topic-specific
              LinkedIn image, and a reusable image-generation plot into the transcript so you can
              review them together.
            </p>
            <div class="creator__actions">
              <button id="generateLinkedInButton" class="button--primary" type="button">
                Generate LinkedIn Post
              </button>
            </div>
            <div id="linkedinMeta" class="creator__meta">
              Ready to add a downloadable LinkedIn post, image, and image-generation plot to the answer area.
            </div>
          </section>

          <section class="docs">
            <p class="section__eyebrow">In-App Documentation</p>
            <h2 class="section__title">Why it exists, how it works, how to use it, and how to recover when something goes wrong.</h2>
            <div class="docs__grid">
              <article class="docs__card">
                <h3>Why It Exists</h3>
                <p>
                  CISSP Buddy exists to help candidates study smarter with clear explanations,
                  disciplined practice, and a calmer path toward exam success.
                </p>
              </article>
              <article class="docs__card">
                <h3>How It Works</h3>
                <p>
                  A VS Code extension host coordinates a branded webview UI, GitHub Copilot model
                  calls, quiz-session state, local guardrails, configurable wrong-answer review depth,
                  PDF export, and LinkedIn draft generation.
                </p>
              </article>
              <article class="docs__card">
                <h3>User Guide</h3>
                <p>
                  Walk through every visible control in the app, including quiz length, detailed
                  wrong-answer review, LinkedIn drafts, PDF export, and transcript usage.
                </p>
              </article>
              <article class="docs__card">
                <h3>FAQ</h3>
                <p>
                  Fast answers to the practical questions users and maintainers usually ask about
                  the architecture, guardrails, scope, and why the app is built this way.
                </p>
              </article>
              <article class="docs__card">
                <h3>Launch Requirements</h3>
                <p>
                  VS Code 1.110+, GitHub Copilot Chat access, Node.js, and npm. Build with the commands below, then run the extension host or install the packaged VSIX.
                </p>
                <div class="docs__code">npm install
npm run compile
F5</div>
              </article>
              <article class="docs__card">
                <h3>Troubleshooting</h3>
                <p>
                  Use the troubleshooting guide when the app will not open, the model does not respond,
                  packaging fails, or the installed version looks stale after an update.
                </p>
              </article>
              <article class="docs__card">
                <h3>Demo Script</h3>
                <p>
                  A clear walkthrough script for interviews, LinkedIn demos, and product introductions.
                </p>
              </article>
            </div>
            <div class="docs__actions" style="margin-top: 16px;">
              <button class="button--secondary" type="button" data-external-url="${USER_GUIDE_DOC_URL}">
                User Guide
              </button>
              <button class="button--secondary" type="button" data-external-url="${FAQ_DOC_URL}">
                FAQ
              </button>
              <button class="button--secondary" type="button" data-external-url="${ARCHITECTURE_DOC_URL}">
                Architecture Docs
              </button>
              <button class="button--secondary" type="button" data-external-url="${LAUNCH_DOC_URL}">
                Launch Docs
              </button>
              <button class="button--secondary" type="button" data-external-url="${TROUBLESHOOTING_DOC_URL}">
                Troubleshooting
              </button>
              <button class="button--secondary" type="button" data-external-url="${DEMO_SCRIPT_DOC_URL}">
                Demo Script
              </button>
            </div>
          </section>
        </div>
      </div>

      <main id="transcript" class="transcript"></main>

      <div class="composer-dock">
        <section id="composer" class="composer">
          <div class="composer__topline">
            <div class="composer__headline">
              <div class="composer__label">Study Composer</div>
              <div id="statusText" class="composer__status">
                Ask a CISSP topic or answer with A, B, C, or D.
              </div>
            </div>
            <button id="composerToggleButton" class="button--ghost composer__toggle" type="button">
              Collapse
            </button>
          </div>

          <div class="composer__body">
            <div class="composer__controls">
              <div class="composer__control">
                <label for="questionCount">Quiz length</label>
                <select id="questionCount"></select>
              </div>
              <label class="composer__checkbox" for="detailedWrongAnswers">
                <input id="detailedWrongAnswers" type="checkbox" />
                Explain wrong answers in detail
              </label>
              <div id="quizSummary" class="quiz-summary">
                Choose how many questions to ask on the next topic. Default is 1.
              </div>
            </div>

            <form id="promptForm">
              <textarea
                id="promptInput"
                placeholder="Explain zero trust, quiz me on risk management, or answer the last question with A, B, C, or D."
              ></textarea>
              <div class="composer__actions">
                <div class="toolbar">
                  <button id="resetButton" class="button--ghost" type="button">New Session</button>
                  <button id="exportButton" class="button--ghost" type="button">Export PDF</button>
                  <button id="generateLinkedInToolbarButton" class="button--ghost" type="button">
                    Generate LinkedIn
                  </button>
                </div>
                <div class="composer__actions-right">
                  <button id="sendButton" class="button--primary" type="submit">
                    Ask CISSP Buddy
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>

    <div id="termsModal" class="terms-modal" hidden>
      <section class="terms-modal__card">
        <p class="section__eyebrow">Required Before First Use</p>
        <h2 class="terms-modal__title">Accept the CISSP Buddy terms before using the software.</h2>
        <p class="terms-modal__body">
          CISSP Buddy is intended to help you review concepts more effectively, but use of the
          software remains completely at your own discretion. Read the notice below carefully and
          accept it before starting your first study session.
        </p>
        <ul id="termsModalList" class="terms-modal__list"></ul>
        <label class="terms-modal__checkbox">
          <input id="termsCheckbox" type="checkbox" />
          <span>
            I understand that CISSP Buddy is a review aid only, that I should confirm knowledge
            with multiple CISSP study sources, and that I accept full responsibility for how I use
            any information produced by this software.
          </span>
        </label>
        <div id="termsHint" class="terms-modal__hint"></div>
        <div class="legal__actions" style="margin-top: 18px;">
          <button id="acceptTermsButton" class="button--primary" type="button" disabled>
            Accept Terms And Continue
          </button>
        </div>
      </section>
    </div>

    <script nonce="${nonce}">
      const BRAND_NAME_TEXT = ${JSON.stringify(BRAND_NAME)};
      const MIN_QUIZ_QUESTIONS = ${MIN_QUIZ_QUESTIONS};
      const MAX_QUIZ_QUESTIONS = ${MAX_QUIZ_QUESTIONS};

      const vscode = acquireVsCodeApi();
      const persistedViewState = vscode.getState() || {};

      function shouldCollapseComposerByDefault() {
        return window.innerHeight <= 860 || window.innerWidth <= 760;
      }

      const state = {
        activeQuiz: null,
        busyLabel: '',
        composerCollapsed:
          typeof persistedViewState.composerCollapsed === 'boolean'
            ? persistedViewState.composerCollapsed
            : shouldCollapseComposerByDefault(),
        isBusy: false,
        legalDisclaimerLines: [],
        linkedinDraft: null,
        pendingPromptTopic: '',
        quickPrompts: [],
        selectedDetailedWrongAnswers: false,
        selectedQuestionCount: MIN_QUIZ_QUESTIONS,
        termsAccepted: false,
        termsAcceptedAt: '',
        transcript: []
      };

      const composerElement = document.getElementById('composer');
      const composerToggleButton = document.getElementById('composerToggleButton');
      const acceptTermsButton = document.getElementById('acceptTermsButton');
      const quickPromptsElement = document.getElementById('quickPrompts');
      const legalMetaElement = document.getElementById('legalMeta');
      const legalRibbonPillElement = document.getElementById('legalRibbonPill');
      const legalRibbonTextElement = document.getElementById('legalRibbonText');
      const legalStatusElement = document.getElementById('legalStatus');
      const legalSummaryElement = document.getElementById('legalSummary');
      const transcriptElement = document.getElementById('transcript');
      const statusTextElement = document.getElementById('statusText');
      const quizSummaryElement = document.getElementById('quizSummary');
      const promptForm = document.getElementById('promptForm');
      const promptInput = document.getElementById('promptInput');
      const questionCountSelect = document.getElementById('questionCount');
      const detailedWrongAnswersInput = document.getElementById('detailedWrongAnswers');
      const sendButton = document.getElementById('sendButton');
      const exportButton = document.getElementById('exportButton');
      const resetButton = document.getElementById('resetButton');
      const generateLinkedInToolbarButton = document.getElementById('generateLinkedInToolbarButton');
      const generateLinkedInButton = document.getElementById('generateLinkedInButton');
      const linkedinMetaElement = document.getElementById('linkedinMeta');
      const termsCheckbox = document.getElementById('termsCheckbox');
      const termsHintElement = document.getElementById('termsHint');
      const termsModalElement = document.getElementById('termsModal');
      const termsModalListElement = document.getElementById('termsModalList');

      for (let count = MIN_QUIZ_QUESTIONS; count <= MAX_QUIZ_QUESTIONS; count += 1) {
        const option = document.createElement('option');
        option.value = String(count);
        option.textContent = String(count);
        questionCountSelect.appendChild(option);
      }

      function escapeHtml(value) {
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function escapeSvg(value) {
        return escapeHtml(String(value || ''));
      }

      const linkedInGraphicCache = new Map();

      function wrapSvgText(value, maxCharactersPerLine) {
        const words = String(value || '').trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          return [];
        }

        const lines = [];
        let currentLine = '';

        words.forEach((word) => {
          const nextLine = currentLine ? currentLine + ' ' + word : word;
          if (nextLine.length <= maxCharactersPerLine) {
            currentLine = nextLine;
            return;
          }

          if (currentLine) {
            lines.push(currentLine);
          }
          currentLine = word;
        });

        if (currentLine) {
          lines.push(currentLine);
        }

        return lines.slice(0, 3);
      }

      function buildMotifMarkup(motif, palette) {
        switch (motif) {
          case 'network':
            return (
              '<g opacity="0.34">' +
              '<circle cx="915" cy="168" r="54" fill="' + palette.highlight + '" fill-opacity="0.14" />' +
              '<circle cx="1038" cy="265" r="46" fill="' + palette.accent + '" fill-opacity="0.18" />' +
              '<circle cx="868" cy="346" r="42" fill="#ffffff" fill-opacity="0.08" />' +
              '<path d="M915 168L1038 265L868 346Z" fill="none" stroke="#ffffff" stroke-opacity="0.24" stroke-width="10" />' +
              '</g>'
            );
          case 'continuity':
            return (
              '<g opacity="0.34">' +
              '<path d="M836 170C908 108 1024 110 1091 176C1152 236 1162 339 1114 412" fill="none" stroke="' +
              palette.highlight +
              '" stroke-width="22" stroke-linecap="round" />' +
              '<path d="M1099 414L1118 365L1156 413Z" fill="' + palette.highlight + '" />' +
              '<path d="M1112 504C1040 566 924 564 857 498C796 438 786 335 834 262" fill="none" stroke="' +
              palette.accent +
              '" stroke-width="22" stroke-linecap="round" />' +
              '<path d="M849 260L830 309L792 261Z" fill="' + palette.accent + '" />' +
              '</g>'
            );
          case 'identity':
            return (
              '<g opacity="0.34">' +
              '<circle cx="975" cy="190" r="74" fill="' + palette.highlight + '" fill-opacity="0.16" />' +
              '<path d="M905 352C905 305 937 272 975 272C1013 272 1045 305 1045 352V392H905Z" fill="#ffffff" fill-opacity="0.08" />' +
              '<rect x="918" y="324" width="114" height="118" rx="24" fill="' + palette.accent + '" fill-opacity="0.18" />' +
              '<circle cx="975" cy="369" r="12" fill="#ffffff" fill-opacity="0.8" />' +
              '<rect x="969" y="381" width="12" height="33" rx="6" fill="#ffffff" fill-opacity="0.8" />' +
              '</g>'
            );
          case 'governance':
            return (
              '<g opacity="0.34">' +
              '<rect x="860" y="132" width="230" height="298" rx="28" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.16" stroke-width="8" />' +
              '<path d="M915 209H1034" stroke="' + palette.highlight + '" stroke-width="14" stroke-linecap="round" />' +
              '<path d="M915 266H1034" stroke="' + palette.accent + '" stroke-width="14" stroke-linecap="round" />' +
              '<path d="M915 323H995" stroke="#ffffff" stroke-opacity="0.45" stroke-width="14" stroke-linecap="round" />' +
              '<circle cx="1048" cy="323" r="28" fill="' + palette.highlight + '" fill-opacity="0.18" />' +
              '<path d="M1037 323L1045 331L1061 314" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />' +
              '</g>'
            );
          case 'data':
            return (
              '<g opacity="0.34">' +
              '<ellipse cx="976" cy="170" rx="118" ry="40" fill="' + palette.highlight + '" fill-opacity="0.18" />' +
              '<path d="M858 170V360C858 382 911 400 976 400C1041 400 1094 382 1094 360V170" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.16" stroke-width="8" />' +
              '<path d="M858 236C858 258 911 276 976 276C1041 276 1094 258 1094 236" fill="none" stroke="' + palette.accent + '" stroke-width="10" />' +
              '<path d="M858 302C858 324 911 342 976 342C1041 342 1094 324 1094 302" fill="none" stroke="' + palette.highlight + '" stroke-width="10" />' +
              '</g>'
            );
          case 'incident':
            return (
              '<g opacity="0.34">' +
              '<path d="M975 122L1109 392H841Z" fill="' + palette.highlight + '" fill-opacity="0.14" stroke="#ffffff" stroke-opacity="0.16" stroke-width="10" />' +
              '<rect x="962" y="215" width="26" height="96" rx="13" fill="#ffffff" fill-opacity="0.82" />' +
              '<circle cx="975" cy="348" r="16" fill="#ffffff" fill-opacity="0.82" />' +
              '<circle cx="1088" cy="175" r="24" fill="' + palette.accent + '" fill-opacity="0.2" />' +
              '</g>'
            );
          case 'shield':
          default:
            return (
              '<g opacity="0.34">' +
              '<path d="M976 120L1089 163V255C1089 334 1046 406 976 454C906 406 863 334 863 255V163Z" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.18" stroke-width="10" />' +
              '<path d="M976 182C931 182 894 219 894 264C894 338 976 396 976 396C976 396 1058 338 1058 264C1058 219 1021 182 976 182Z" fill="' + palette.accent + '" fill-opacity="0.18" />' +
              '<path d="M938 281L966 309L1018 246" fill="none" stroke="' + palette.highlight + '" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />' +
              '</g>'
            );
        }
      }

      function buildKeywordMarkup(keywords, palette) {
        return (keywords || [])
          .slice(0, 3)
          .map((keyword, index) => {
            const x = 72 + index * 178;
            return (
              '<g>' +
              '<rect x="' +
              x +
              '" y="504" width="164" height="48" rx="24" fill="#ffffff" fill-opacity="0.08" stroke="' +
              palette.accent +
              '" stroke-opacity="0.28" />' +
              '<text x="' +
              (x + 82) +
              '" y="534" fill="#ffffff" font-size="18" font-family="Segoe UI, sans-serif" text-anchor="middle">' +
              escapeSvg(keyword) +
              '</text>' +
              '</g>'
            );
          })
          .join('');
      }

      function renderSvgLines(lines, x, y, lineHeight, style) {
        return lines
          .map((line, index) => {
            return (
              '<text x="' +
              x +
              '" y="' +
              (y + index * lineHeight) +
              '" style="' +
              style +
              '">' +
              escapeSvg(line) +
              '</text>'
            );
          })
          .join('');
      }

      function buildLinkedInGraphicSvg(spec) {
        const palette = spec && spec.palette
          ? spec.palette
          : { backgroundStart: '#0c2238', backgroundEnd: '#133f63', accent: '#4bd38f', highlight: '#d5b15d' };
        const headlineLines = wrapSvgText(spec && spec.headline ? spec.headline : 'CISSP Topic Focus', 22);
        const subheadlineLines = wrapSvgText(spec && spec.subheadline ? spec.subheadline : '', 42);
        const eyebrow = spec && spec.eyebrow ? spec.eyebrow : 'CISSP Topic Focus';
        const keywords = spec && Array.isArray(spec.keywords) ? spec.keywords : [];
        const motif = spec && spec.motif ? spec.motif : 'shield';

        return (
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">' +
          '<defs>' +
          '<linearGradient id="bgGradient" x1="96" y1="88" x2="1094" y2="587" gradientUnits="userSpaceOnUse">' +
          '<stop stop-color="' + palette.backgroundStart + '" />' +
          '<stop offset="1" stop-color="' + palette.backgroundEnd + '" />' +
          '</linearGradient>' +
          '<radialGradient id="accentGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(965 232) rotate(141.411) scale(358 358)">' +
          '<stop stop-color="' + palette.accent + '" stop-opacity="0.42" />' +
          '<stop offset="1" stop-color="' + palette.accent + '" stop-opacity="0" />' +
          '</radialGradient>' +
          '<radialGradient id="highlightGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(266 552) rotate(45) scale(270 270)">' +
          '<stop stop-color="' + palette.highlight + '" stop-opacity="0.28" />' +
          '<stop offset="1" stop-color="' + palette.highlight + '" stop-opacity="0" />' +
          '</radialGradient>' +
          '</defs>' +
          '<rect width="1200" height="675" rx="40" fill="url(#bgGradient)" />' +
          '<rect x="24" y="24" width="1152" height="627" rx="32" fill="none" stroke="#ffffff" stroke-opacity="0.09" />' +
          '<circle cx="974" cy="228" r="238" fill="url(#accentGlow)" />' +
          '<circle cx="250" cy="562" r="190" fill="url(#highlightGlow)" />' +
          '<path d="M94 112H1106" stroke="#ffffff" stroke-opacity="0.06" />' +
          '<path d="M94 584H1106" stroke="#ffffff" stroke-opacity="0.06" />' +
          buildMotifMarkup(motif, palette) +
          '<text x="74" y="110" fill="' + palette.highlight + '" font-size="22" font-weight="700" letter-spacing="2.8" font-family="Segoe UI, sans-serif">' +
          escapeSvg(eyebrow.toUpperCase()) +
          '</text>' +
          renderSvgLines(
            headlineLines,
            72,
            208,
            68,
            'fill:#ffffff;font-size:58px;font-weight:800;font-family:Segoe UI, sans-serif'
          ) +
          renderSvgLines(
            subheadlineLines,
            76,
            386,
            34,
            'fill:rgba(255,255,255,0.82);font-size:24px;font-weight:500;font-family:Segoe UI, sans-serif'
          ) +
          buildKeywordMarkup(keywords, palette) +
          '<g transform="translate(72 588)">' +
          '<rect width="320" height="56" rx="20" fill="#081521" fill-opacity="0.42" />' +
          '<text x="20" y="28" fill="#ffffff" font-size="20" font-weight="700" font-family="Segoe UI, sans-serif">LinkedIn Study Visual</text>' +
          '<text x="20" y="46" fill="rgba(255,255,255,0.68)" font-size="14" font-family="Segoe UI, sans-serif">Topic-focused cybersecurity concept art</text>' +
          '</g>' +
          '<text x="1118" y="620" fill="rgba(255,255,255,0.52)" font-size="16" text-anchor="end" font-family="Segoe UI, sans-serif">Professional CISSP concept image</text>' +
          '</svg>'
        );
      }

      function buildLinkedInGraphicDataUrl(spec) {
        const cacheKey = JSON.stringify(spec || {});
        if (linkedInGraphicCache.has(cacheKey)) {
          return linkedInGraphicCache.get(cacheKey);
        }

        const dataUrl =
          'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildLinkedInGraphicSvg(spec));
        linkedInGraphicCache.set(cacheKey, dataUrl);
        return dataUrl;
      }

      function createLinkedInGraphicPngDataUrl(spec) {
        const svgMarkup = buildLinkedInGraphicSvg(spec);
        const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 675;
            const context = canvas.getContext('2d');

            if (!context) {
              URL.revokeObjectURL(svgUrl);
              reject(new Error('Canvas context unavailable.'));
              return;
            }

            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(svgUrl);
            resolve(canvas.toDataURL('image/png'));
          };

          image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            reject(new Error('Unable to render the LinkedIn graphic.'));
          };

          image.src = svgUrl;
        });
      }

      function selectedQuestionCount() {
        return Number(questionCountSelect.value || state.selectedQuestionCount || MIN_QUIZ_QUESTIONS);
      }

      function detailedWrongAnswersEnabled() {
        return Boolean(detailedWrongAnswersInput.checked);
      }

      function persistViewState() {
        vscode.setState({
          composerCollapsed: state.composerCollapsed
        });
      }

      function renderQuickPrompts() {
        quickPromptsElement.innerHTML = state.quickPrompts
          .map(
            (prompt) =>
              '<button class="button--prompt" type="button" data-quick-prompt="' +
              escapeHtml(prompt) +
              '"' +
              (state.termsAccepted ? '' : ' disabled') +
              ' title="' +
              escapeHtml(
                state.termsAccepted
                  ? 'Launch this prompt'
                  : 'Accept the CISSP Buddy terms before using quick prompts.'
              ) +
              '">' +
              escapeHtml(prompt) +
              '</button>'
          )
          .join('');
      }

      function renderLegalNotice() {
        legalSummaryElement.innerHTML = state.legalDisclaimerLines
          .map((line) => '<li>' + escapeHtml(line) + '</li>')
          .join('');

        legalRibbonPillElement.textContent = state.termsAccepted
          ? 'Terms Accepted'
          : 'Acceptance Required';
        legalRibbonTextElement.textContent = state.termsAccepted
          ? 'Use CISSP Buddy at your own discretion. No liability is assumed, and important concepts should still be confirmed with multiple CISSP study sources.'
          : 'Use CISSP Buddy at your own discretion. No liability is assumed, and you must accept the notice before the study workflow unlocks.';

        legalStatusElement.textContent = state.termsAccepted
          ? 'Terms Accepted'
          : 'Acceptance Required';

        if (state.termsAccepted) {
          legalMetaElement.textContent = state.termsAcceptedAt
            ? 'Accepted on ' + state.termsAcceptedAt + '. Continue confirming important concepts with multiple CISSP study sources.'
            : 'Terms accepted. Continue confirming important concepts with multiple CISSP study sources.';
          return;
        }

        if (state.pendingPromptTopic) {
          legalMetaElement.textContent =
            'Acceptance is required before first use. Your pending topic "' +
            state.pendingPromptTopic +
            '" will start automatically after acceptance.';
          return;
        }

        legalMetaElement.textContent =
          'Acceptance is required before your first study session. Use this tool only at your own discretion and confirm important topics with multiple CISSP study sources.';
      }

      function renderTermsGate() {
        const requiresAcceptance = !state.termsAccepted;
        termsModalElement.hidden = !requiresAcceptance;

        if (requiresAcceptance) {
          termsModalListElement.innerHTML = state.legalDisclaimerLines
            .map((line) => '<li>' + escapeHtml(line) + '</li>')
            .join('');
          acceptTermsButton.disabled = !termsCheckbox.checked;
          termsHintElement.textContent = state.pendingPromptTopic
            ? 'A study topic is queued and will begin after you accept the terms.'
            : 'Accept once to unlock the study workflow on this device.';
          return;
        }

        termsHintElement.textContent = '';
        termsCheckbox.checked = false;
        acceptTermsButton.disabled = true;
      }

      function renderTranscript() {
        if (state.transcript.length === 0) {
          transcriptElement.innerHTML =
            '<section class="empty-state">' +
            '<h2>' +
            escapeHtml(BRAND_NAME_TEXT) +
            ' is ready.</h2>' +
            '<p>Choose a quiz length, ask a CISSP topic, and the app will explain the concept and guide you through however many questions you selected. Afterward, generate a LinkedIn post and export the transcript if you want reusable study notes.</p>' +
            '</section>';
          return;
        }

        transcriptElement.innerHTML = state.transcript
          .map((entry, index) => {
            if (entry.kind === 'linkedinDraft') {
              const graphicDataUrl = buildLinkedInGraphicDataUrl(entry.visualSpec);
              return (
                '<article class="message">' +
                '<div class="message__bubble">' +
                '<div class="message__meta">' +
                '<span class="message__role">LinkedIn Draft</span>' +
                '<span>' +
                escapeHtml(entry.timestamp) +
                '</span>' +
                '</div>' +
                '<div class="message__linkedin">' +
                '<img class="message__linkedin-visual" src="' +
                graphicDataUrl +
                '" alt="' +
                escapeHtml(entry.imageAlt || 'Topic-specific LinkedIn graphic') +
                '" />' +
                '<div>' +
                '<p class="message__linkedin-topic">' +
                escapeHtml(entry.topic || 'CISSP Topic') +
                '</p>' +
                '<h3 class="message__linkedin-title">LinkedIn Post And Graphic Ready To Review</h3>' +
                '</div>' +
                '<div class="message__plot">' +
                '<p class="message__plot-title">Image Generation Plot</p>' +
                '<pre class="message__content">' +
                escapeHtml(entry.imagePlot || 'No image plot available for this topic yet.') +
                '</pre>' +
                '</div>' +
                '<pre class="message__content">' +
                escapeHtml(entry.text) +
                '</pre>' +
                '</div>' +
                '</div>' +
                '</article>'
              );
            }

            const roleLabel = entry.role === 'user' ? 'You' : 'CISSP Buddy';
            const messageClass = entry.role === 'user' ? 'message message--user' : 'message';
            return (
              '<article class="' +
              messageClass +
              '">' +
              '<div class="message__bubble">' +
              '<div class="message__meta">' +
              '<span class="message__role">' +
              escapeHtml(roleLabel) +
              '</span>' +
              '<span>' +
              escapeHtml(entry.timestamp) +
              '</span>' +
              '</div>' +
              '<pre class="message__content">' +
              escapeHtml(entry.text) +
              '</pre>' +
              '</div>' +
              '</article>'
            );
          })
          .join('');

        window.requestAnimationFrame(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
      }

      function renderLinkedInDraft() {
        if (state.linkedinDraft) {
          linkedinMetaElement.textContent =
            'Generated for "' +
            state.linkedinDraft.topic +
            '" on ' +
            state.linkedinDraft.generatedAt +
            '. View the post, topic-specific image, and image-generation plot in the answer area.';
          return;
        }

        if (state.activeQuiz && state.activeQuiz.awaitingAnswer) {
          linkedinMetaElement.textContent =
            'Quiz in progress. Type your answer to the current question before generating a LinkedIn draft.';
          return;
        }

        linkedinMetaElement.textContent =
          'Generate a LinkedIn draft from the last studied topic, or from the current composer topic if no study session has been started yet.';
      }

      function requestLinkedInDraft() {
        vscode.postMessage({
          type: 'generateLinkedInPost',
          topic: promptInput.value.trim()
        });
      }

      function renderQuizSummary() {
        if (state.activeQuiz && state.activeQuiz.awaitingAnswer) {
          quizSummaryElement.textContent =
            'Active quiz: question ' +
            state.activeQuiz.currentQuestion +
            ' of ' +
            state.activeQuiz.totalQuestions +
            ' on ' +
            state.activeQuiz.topic +
            '. ' +
            (state.activeQuiz.explainWrongAnswersInDetail
              ? 'Detailed wrong-answer review is on.'
              : 'Detailed wrong-answer review is off.');
          return;
        }

        if (state.activeQuiz && state.activeQuiz.completed) {
          quizSummaryElement.textContent =
            'Completed a ' +
            state.activeQuiz.totalQuestions +
            '-question quiz on ' +
            state.activeQuiz.topic +
            '. Score: ' +
            state.activeQuiz.correctAnswers +
            '/' +
            state.activeQuiz.totalQuestions +
            ' correct. Choose a new topic to start another round.';
          return;
        }

        quizSummaryElement.textContent =
          'Choose how many questions to ask on the next topic. Turn on detailed wrong-answer review if you want a deeper explanation of the three distractors.';
      }

      function renderControls() {
        const trimmedInput = promptInput.value.trim();
        const quizAwaitingAnswer = Boolean(state.activeQuiz && state.activeQuiz.awaitingAnswer);
        const controlsLocked = state.isBusy || !state.termsAccepted;
        statusTextElement.textContent = state.isBusy
          ? state.busyLabel || 'Preparing your next study step...'
          : state.termsAccepted
            ? 'Ask a CISSP topic or answer with A, B, C, or D.'
            : 'Accept the CISSP Buddy terms to unlock the study workflow.';
        questionCountSelect.value = String(state.selectedQuestionCount || MIN_QUIZ_QUESTIONS);
        detailedWrongAnswersInput.checked = Boolean(state.selectedDetailedWrongAnswers);
        promptInput.disabled = controlsLocked;
        questionCountSelect.disabled = controlsLocked;
        detailedWrongAnswersInput.disabled = controlsLocked;
        sendButton.disabled = controlsLocked || trimmedInput.length === 0;
        exportButton.disabled = state.transcript.length === 0 || !state.termsAccepted;
        resetButton.disabled = state.transcript.length === 0 || controlsLocked;
        generateLinkedInToolbarButton.disabled = controlsLocked;
        generateLinkedInButton.disabled = controlsLocked;

        generateLinkedInToolbarButton.textContent = quizAwaitingAnswer
          ? 'Answer Quiz First'
          : 'Generate LinkedIn';
        generateLinkedInButton.textContent = quizAwaitingAnswer
          ? 'Answer Quiz First'
          : 'Generate LinkedIn Post';

        const linkedInHint = quizAwaitingAnswer
          ? 'Quiz in progress. Type your answer with A, B, C, or D before generating a LinkedIn post.'
          : !state.termsAccepted
            ? 'Accept the CISSP Buddy terms before generating LinkedIn content.'
          : 'Generate a LinkedIn draft, topic-specific visual, and image-generation plot from the last studied topic or the current composer topic.';

        generateLinkedInToolbarButton.title = linkedInHint;
        generateLinkedInButton.title = linkedInHint;
      }

      function renderComposer() {
        composerElement.classList.toggle('composer--collapsed', Boolean(state.composerCollapsed));
        composerToggleButton.textContent = state.composerCollapsed ? 'Open Composer' : 'Collapse';
        composerToggleButton.setAttribute('aria-expanded', String(!state.composerCollapsed));
        composerToggleButton.setAttribute(
          'aria-label',
          state.composerCollapsed ? 'Open study composer' : 'Collapse study composer'
        );
      }

      function render() {
        renderQuickPrompts();
        renderLegalNotice();
        renderTranscript();
        renderLinkedInDraft();
        renderQuizSummary();
        renderControls();
        renderComposer();
        renderTermsGate();
      }

      promptForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = promptInput.value.trim();
        if (!text || state.isBusy) {
          return;
        }

        promptInput.value = '';
        renderControls();
        vscode.postMessage({
          type: 'submitPrompt',
          text,
          questionCount: selectedQuestionCount(),
          detailedWrongAnswers: detailedWrongAnswersEnabled()
        });
      });

      promptInput.addEventListener('input', () => {
        renderControls();
      });

      termsCheckbox.addEventListener('change', () => {
        acceptTermsButton.disabled = !termsCheckbox.checked;
      });

      acceptTermsButton.addEventListener('click', () => {
        if (!termsCheckbox.checked) {
          return;
        }

        vscode.postMessage({ type: 'acceptTerms' });
      });

      composerToggleButton.addEventListener('click', () => {
        state.composerCollapsed = !state.composerCollapsed;
        persistViewState();
        renderComposer();
        if (!state.composerCollapsed) {
          promptInput.focus();
        }
      });

      questionCountSelect.addEventListener('change', () => {
        vscode.postMessage({
          type: 'setQuestionCount',
          questionCount: selectedQuestionCount()
        });
      });

      detailedWrongAnswersInput.addEventListener('change', () => {
        vscode.postMessage({
          type: 'setDetailedWrongAnswers',
          enabled: detailedWrongAnswersEnabled()
        });
      });

      exportButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'exportPdf' });
      });

      resetButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'resetTranscript' });
      });

      generateLinkedInToolbarButton.addEventListener('click', () => {
        requestLinkedInDraft();
      });

      generateLinkedInButton.addEventListener('click', () => {
        requestLinkedInDraft();
      });

      quickPromptsElement.addEventListener('click', (event) => {
        const button = event.target.closest('[data-quick-prompt]');
        if (!button || state.isBusy) {
          return;
        }

        vscode.postMessage({
          type: 'quickPrompt',
          text: button.getAttribute('data-quick-prompt') || '',
          questionCount: selectedQuestionCount(),
          detailedWrongAnswers: detailedWrongAnswersEnabled()
        });
      });

      document.body.addEventListener('click', (event) => {
        const button = event.target.closest('[data-external-url]');
        if (!button) {
          return;
        }

        vscode.postMessage({
          type: 'openExternal',
          url: button.getAttribute('data-external-url') || ''
        });
      });

      window.addEventListener('message', (event) => {
        if (event.data.type !== 'state') {
          return;
        }

        state.activeQuiz = event.data.payload.activeQuiz;
        state.busyLabel = event.data.payload.busyLabel;
        state.isBusy = event.data.payload.isBusy;
        state.legalDisclaimerLines = event.data.payload.legalDisclaimerLines;
        state.linkedinDraft = event.data.payload.linkedinDraft;
        state.pendingPromptTopic = event.data.payload.pendingPromptTopic;
        state.quickPrompts = event.data.payload.quickPrompts;
        state.selectedDetailedWrongAnswers = event.data.payload.selectedDetailedWrongAnswers;
        state.selectedQuestionCount = event.data.payload.selectedQuestionCount;
        state.termsAccepted = event.data.payload.termsAccepted;
        state.termsAcceptedAt = event.data.payload.termsAcceptedAt;
        state.transcript = event.data.payload.transcript;
        render();
      });

      vscode.postMessage({ type: 'ready' });
      renderComposer();
      render();
    </script>
  </body>
</html>`;
  }
}

function clampQuestionCount(questionCount: number): number {
  if (!Number.isFinite(questionCount)) {
    return MIN_QUIZ_QUESTIONS;
  }

  return Math.min(MAX_QUIZ_QUESTIONS, Math.max(MIN_QUIZ_QUESTIONS, Math.round(questionCount)));
}

function looksLikeQuizKickoffResponse(text: string, questionCount: number): boolean {
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    return false;
  }

  const questionPattern = new RegExp(`question\\s*1\\s*of\\s*${questionCount}`, 'i');
  return (
    questionPattern.test(normalizedText) &&
    hasChoiceOption(normalizedText, 'A') &&
    hasChoiceOption(normalizedText, 'B') &&
    hasChoiceOption(normalizedText, 'C') &&
    hasChoiceOption(normalizedText, 'D') &&
    /(?:reply|respond|answer)\s+with\s+a,\s*b,\s*c,\s*or\s*d/i.test(normalizedText)
  );
}

function hasChoiceOption(text: string, optionLabel: 'A' | 'B' | 'C' | 'D'): boolean {
  return new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${optionLabel}(?:\\.|\\)|:|-)\\s+\\S`, 'm').test(text);
}

function extractQuizResult(text: string): boolean | undefined {
  const explicitMatch = text.match(/(?:^|\n)\s*Result\s*:\s*(Correct|Incorrect)\s*(?:\n|$)/i);
  if (explicitMatch) {
    return explicitMatch[1].toLowerCase() === 'correct';
  }

  if (/\b(?:you were|your answer was|that is)\s+correct\b/i.test(text)) {
    return true;
  }

  if (/\b(?:you were|your answer was|that is)\s+incorrect\b/i.test(text)) {
    return false;
  }

  return undefined;
}

function enforceFinalScoreLine(
  text: string,
  correctAnswers: number,
  totalQuestions: number
): string {
  const scoreLine = `You answered ${correctAnswers}/${totalQuestions} questions correctly.`;
  let normalized = text
    .replace(/(?:^|\n)\s*Quiz complete\s*:?.*(?=\n|$)/gi, '\nScore')
    .replace(/(?:^|\n)\s*You answered\s+\d+\s*\/\s*\d+\s+questions correctly\.?\s*(?=\n|$)/gi, '')
    .trim();

  if (!/(?:^|\n)\s*Score\s*(?:\n|$)/i.test(normalized)) {
    normalized = `${normalized}\n\nScore`;
  }

  normalized = normalized.replace(/\s+$/, '');
  return `${normalized}\n${scoreLine}`.trim();
}

function formatAcceptedAt(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}
