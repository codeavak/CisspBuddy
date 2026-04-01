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
  buildLinkedInPostPrompt,
  buildQuizContinuationPrompt,
  buildQuizStartPrompt,
  MAX_QUIZ_QUESTIONS,
  MIN_QUIZ_QUESTIONS,
  QUICK_PROMPTS
} from './prompts';
import { LinkedInDraft, QuizSession, TranscriptEntry } from './types';

type WebviewMessage =
  | { type: 'ready' }
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
  | { type: 'copyText'; text: string }
  | { type: 'exportPdf' }
  | { type: 'resetTranscript' }
  | { type: 'openExternal'; url: string };

const BRAND_NAME = 'Johnny Avakian\'s CISSP Buddy';
const PORTFOLIO_URL = 'https://codeavak.github.io/portfolio_website/';
const LINKEDIN_URL = 'https://www.linkedin.com/in/codeavak';
const REPO_URL = 'https://github.com/codeavak/cisspbuddy';
const ARCHITECTURE_DOC_URL = `${REPO_URL}/blob/master/docs/ARCHITECTURE.md`;
const LAUNCH_DOC_URL = `${REPO_URL}/blob/master/docs/LAUNCHING.md`;
const USER_GUIDE_DOC_URL = `${REPO_URL}/blob/master/docs/USER_GUIDE.md`;
const FAQ_DOC_URL = `${REPO_URL}/blob/master/docs/FAQ.md`;
const TROUBLESHOOTING_DOC_URL = `${REPO_URL}/blob/master/docs/TROUBLESHOOTING.md`;
const DEMO_SCRIPT_DOC_URL = `${REPO_URL}/blob/master/docs/DEMO_SCRIPT.md`;

export class CisspBuddyPanel implements vscode.Disposable {
  private static currentPanel: CisspBuddyPanel | undefined;

  public static createOrShow(extensionUri: vscode.Uri): CisspBuddyPanel {
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

    CisspBuddyPanel.currentPanel = new CisspBuddyPanel(panel, extensionUri);
    return CisspBuddyPanel.currentPanel;
  }

  public static current(): CisspBuddyPanel | undefined {
    return CisspBuddyPanel.currentPanel;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly extensionUri: vscode.Uri;
  private transcript: TranscriptEntry[] = [];
  private activeQuiz: QuizSession | undefined;
  private linkedinDraft: LinkedInDraft | undefined;
  private selectedQuestionCount = MIN_QUIZ_QUESTIONS;
  private selectedDetailedWrongAnswers = false;
  private lastStudyTopic: string | undefined;
  private isBusy = false;
  private busyLabel = '';
  private requestCancellation: vscode.CancellationTokenSource | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
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
    switch (message.type) {
      case 'ready':
        this.postState();
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
      case 'copyText':
        await vscode.env.clipboard.writeText(message.text);
        await vscode.window.showInformationMessage('Copied the LinkedIn draft to your clipboard.');
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

    if (isFinalQuestion) {
      this.activeQuiz = {
        ...currentQuiz,
        awaitingAnswer: false,
        completed: true
      };
    } else {
      this.activeQuiz = {
        ...currentQuiz,
        currentQuestion: currentQuiz.currentQuestion + 1,
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
      'Drafting a showcase-ready LinkedIn post...'
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

    this.linkedinDraft = {
      topic: resolvedTopic,
      text: draftText,
      generatedAt: new Date().toLocaleString()
    };

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

  private resolveLinkedInTopic(topicCandidate?: string): string | undefined {
    const explicitTopic = topicCandidate?.trim();
    if (explicitTopic) {
      return explicitTopic;
    }

    if (this.activeQuiz?.topic) {
      return this.activeQuiz.topic;
    }

    return this.lastStudyTopic;
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
      role,
      text,
      timestamp: new Date().toLocaleString()
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
        linkedinDraft: this.linkedinDraft,
        quickPrompts: QUICK_PROMPTS,
        selectedDetailedWrongAnswers: this.selectedDetailedWrongAnswers,
        selectedQuestionCount: this.selectedQuestionCount,
        transcript: this.transcript
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'cissp-buddy-logo.svg')
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

      .hero,
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
        grid-template-columns: auto 1fr;
        gap: 18px;
        align-items: center;
      }

      .hero__logo {
        width: 86px;
        height: 86px;
        border-radius: 22px;
        box-shadow: 0 16px 30px rgba(0, 0, 0, 0.24);
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
      <section class="hero">
        <div class="hero__brand">
          <img class="hero__logo" src="${logoUri}" alt="CISSP Buddy logo" />
          <div>
            <p class="hero__eyebrow">Johnny Avakian's</p>
            <h1 class="hero__title">CISSP Buddy</h1>
            <p class="hero__subtitle">
              A portfolio-grade CISSP study experience inside VS Code. Learn the topic,
              take a guided multi-question quiz, export the transcript, and generate a
              LinkedIn-ready post about the subject you just studied.
            </p>
          </div>
        </div>
        <p class="hero__guardrail">
          Defensive-only, CISSP-scoped, and designed to showcase thoughtful product engineering.
        </p>
        <div id="quickPrompts" class="quick-prompts"></div>
      </section>

      <div class="stack">
        <section class="promo">
          <div>
            <p class="section__eyebrow">Portfolio And Referral Request</p>
            <h2 class="section__title">
              Referrals for cybersecurity and senior engineer roles would mean a lot.
            </h2>
            <p class="section__body">
              Johnny is working on posting a CISSP prep blog on the portfolio site. Stars on the
              CISSP Buddy repo and comments on the blog are deeply appreciated.
            </p>
          </div>
          <div class="promo__actions">
            <button class="button--secondary" type="button" data-external-url="${PORTFOLIO_URL}">
              Portfolio
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
            <p class="section__eyebrow">LinkedIn Showcase Draft</p>
            <h2 class="section__title">Generate a post you can paste directly into LinkedIn.</h2>
            <p class="section__body">
              This uses the topic in the composer when present, or the most recent CISSP quiz
              topic, and turns it into a professional thought-leadership post for Johnny Avakian.
            </p>
            <div class="creator__actions">
              <button id="generateLinkedInButton" class="button--primary" type="button">
                Generate LinkedIn Post
              </button>
              <button id="copyLinkedInButton" class="button--ghost" type="button">
                Copy Draft
              </button>
            </div>
            <textarea
              id="linkedinDraft"
              class="creator__draft"
              readonly
              placeholder="Generate a LinkedIn draft from the current topic or the most recent quiz topic."
            ></textarea>
            <div id="linkedinMeta" class="creator__meta">
              Ready to create a polished post for your portfolio and LinkedIn showcase.
            </div>
          </section>

          <section class="docs">
            <p class="section__eyebrow">In-App Documentation</p>
            <h2 class="section__title">Why it exists, how it works, how to use it, and how to recover when something goes wrong.</h2>
            <div class="docs__grid">
              <article class="docs__card">
                <h3>Why It Exists</h3>
                <p>
                  CISSP Buddy demonstrates product thinking, educational UX, safe AI orchestration,
                  and professional extension engineering in one portfolio-ready app.
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
                  Fast answers to the questions users, reviewers, and recruiters usually ask about
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
                  A ready-to-use showcase script for interviews, LinkedIn demos, and portfolio walkthroughs.
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
                  <button id="copyLinkedInToolbarButton" class="button--ghost" type="button">
                    Copy Draft
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

    <script nonce="${nonce}">
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
        linkedinDraft: null,
        quickPrompts: [],
        selectedDetailedWrongAnswers: false,
        selectedQuestionCount: MIN_QUIZ_QUESTIONS,
        transcript: []
      };

      const composerElement = document.getElementById('composer');
      const composerToggleButton = document.getElementById('composerToggleButton');
      const quickPromptsElement = document.getElementById('quickPrompts');
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
      const copyLinkedInToolbarButton = document.getElementById('copyLinkedInToolbarButton');
      const generateLinkedInButton = document.getElementById('generateLinkedInButton');
      const copyLinkedInButton = document.getElementById('copyLinkedInButton');
      const linkedinDraftElement = document.getElementById('linkedinDraft');
      const linkedinMetaElement = document.getElementById('linkedinMeta');

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
              '">' +
              escapeHtml(prompt) +
              '</button>'
          )
          .join('');
      }

      function renderTranscript() {
        if (state.transcript.length === 0) {
          transcriptElement.innerHTML =
            '<section class="empty-state">' +
            '<h2>${BRAND_NAME} is ready.</h2>' +
            '<p>Choose a quiz length, ask a CISSP topic, and the app will explain the concept and guide you through however many questions you selected. Afterward, generate a LinkedIn post and export the transcript if you want a showcase artifact.</p>' +
            '</section>';
          return;
        }

        transcriptElement.innerHTML = state.transcript
          .map((entry) => {
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
        linkedinDraftElement.value = state.linkedinDraft ? state.linkedinDraft.text : '';
        linkedinMetaElement.textContent = state.linkedinDraft
          ? 'Generated for "' + state.linkedinDraft.topic + '" on ' + state.linkedinDraft.generatedAt + '.'
          : 'Generate a LinkedIn draft from the current topic in the composer or the most recent quiz topic.';
      }

      function requestLinkedInDraft() {
        vscode.postMessage({
          type: 'generateLinkedInPost',
          topic: promptInput.value.trim()
        });
      }

      function copyLinkedInDraft() {
        if (!state.linkedinDraft) {
          return;
        }

        vscode.postMessage({
          type: 'copyText',
          text: state.linkedinDraft.text
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
            '. Choose a new topic to start another round.';
          return;
        }

        quizSummaryElement.textContent =
          'Choose how many questions to ask on the next topic. Turn on detailed wrong-answer review if you want a deeper explanation of the three distractors.';
      }

      function renderControls() {
        const trimmedInput = promptInput.value.trim();
        statusTextElement.textContent = state.isBusy
          ? state.busyLabel || 'Preparing your next study step...'
          : 'Ask a CISSP topic or answer with A, B, C, or D.';
        questionCountSelect.value = String(state.selectedQuestionCount || MIN_QUIZ_QUESTIONS);
        detailedWrongAnswersInput.checked = Boolean(state.selectedDetailedWrongAnswers);
        promptInput.disabled = state.isBusy;
        questionCountSelect.disabled = state.isBusy;
        detailedWrongAnswersInput.disabled = state.isBusy;
        sendButton.disabled = state.isBusy || trimmedInput.length === 0;
        exportButton.disabled = state.transcript.length === 0;
        resetButton.disabled = state.transcript.length === 0 || state.isBusy;
        generateLinkedInToolbarButton.disabled = state.isBusy;
        copyLinkedInToolbarButton.disabled = !state.linkedinDraft || state.linkedinDraft.text.length === 0;
        generateLinkedInButton.disabled = state.isBusy;
        copyLinkedInButton.disabled = !state.linkedinDraft || state.linkedinDraft.text.length === 0;
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
        renderTranscript();
        renderLinkedInDraft();
        renderQuizSummary();
        renderControls();
        renderComposer();
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

      copyLinkedInToolbarButton.addEventListener('click', () => {
        copyLinkedInDraft();
      });

      generateLinkedInButton.addEventListener('click', () => {
        requestLinkedInDraft();
      });

      copyLinkedInButton.addEventListener('click', () => {
        copyLinkedInDraft();
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
        state.linkedinDraft = event.data.payload.linkedinDraft;
        state.quickPrompts = event.data.payload.quickPrompts;
        state.selectedDetailedWrongAnswers = event.data.payload.selectedDetailedWrongAnswers;
        state.selectedQuestionCount = event.data.payload.selectedQuestionCount;
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

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}
