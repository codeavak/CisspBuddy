import * as vscode from 'vscode';

import { evaluatePrompt } from './guardrails';
import { createTranscriptPdf } from './pdf';
import { BASE_PROMPT, QUICK_PROMPTS } from './prompts';
import { TranscriptEntry } from './types';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'submitPrompt'; text: string }
  | { type: 'quickPrompt'; text: string }
  | { type: 'exportPdf' }
  | { type: 'resetTranscript' }
  | { type: 'openExternal'; url: string };

const PORTFOLIO_URL = 'https://github.com/codeavak/portfolio_website';
const LINKEDIN_URL = 'https://www.linkedin.com/in/codeavak';
const REPO_URL = 'https://github.com/codeavak/cisspbuddy';

export class CisspBuddyPanel implements vscode.Disposable {
  private static currentPanel: CisspBuddyPanel | undefined;

  public static createOrShow(extensionUri: vscode.Uri): CisspBuddyPanel {
    if (CisspBuddyPanel.currentPanel) {
      CisspBuddyPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return CisspBuddyPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'cisspBuddy.app',
      'Johnny Avakian Presents CISSP Budyy',
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
  private isBusy = false;
  private requestCancellation: vscode.CancellationTokenSource | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'cissp-budyy-icon.png');
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

  public async ask(prompt: string): Promise<void> {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      return;
    }

    if (this.isBusy) {
      await vscode.window.showWarningMessage(
        'Johnny Avakian Presents CISSP Budyy is finishing the current response. Please try again in a moment.'
      );
      return;
    }

    this.panel.reveal(vscode.ViewColumn.Beside);

    const guardrailOutcome = evaluatePrompt(trimmedPrompt, this.transcript);

    const userEntry: TranscriptEntry = {
      role: 'user',
      text: trimmedPrompt,
      timestamp: new Date().toLocaleString()
    };

    this.transcript.push(userEntry);
    this.postState();

    if (!guardrailOutcome.allowed) {
      this.transcript.push({
        role: 'assistant',
        text:
          guardrailOutcome.response ??
          'That request is out of scope for Johnny Avakian Presents CISSP Budyy.',
        timestamp: new Date().toLocaleString()
      });
      this.postState();
      return;
    }

    const modelMessages = this.buildModelMessages();

    const assistantEntry: TranscriptEntry = {
      role: 'assistant',
      text: '',
      timestamp: new Date().toLocaleString()
    };

    this.transcript.push(assistantEntry);
    this.isBusy = true;
    this.postState();

    try {
      const model = await this.selectModel();
      this.requestCancellation = new vscode.CancellationTokenSource();
      const response = await model.sendRequest(
        modelMessages,
        {},
        this.requestCancellation.token
      );

      for await (const fragment of response.text) {
        assistantEntry.text += fragment;
        this.postState();
      }

      if (assistantEntry.text.trim().length === 0) {
        assistantEntry.text =
          'Johnny Avakian Presents CISSP Budyy did not receive a response from the model. Please try that topic again.';
      }
    } catch (error) {
      assistantEntry.text = this.toErrorMessage(error);
    } finally {
      this.isBusy = false;
      this.requestCancellation?.dispose();
      this.requestCancellation = undefined;
      this.postState();
    }
  }

  public async exportTranscript(): Promise<void> {
    if (this.transcript.length === 0) {
      await vscode.window.showInformationMessage(
        'Start a Johnny Avakian Presents CISSP Budyy session before exporting a PDF.'
      );
      return;
    }

    const suggestedName = `johnny-avakian-presents-cissp-budyy-${new Date()
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
        await this.ask(message.text);
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

  private async resetTranscript(): Promise<void> {
    if (this.isBusy) {
      await vscode.window.showWarningMessage(
        'Wait for the current response to finish before starting a new CISSP Budyy session.'
      );
      return;
    }

    this.transcript = [];
    this.postState();
  }

  private buildModelMessages(): vscode.LanguageModelChatMessage[] {
    const historyMessages = this.transcript
      .filter((entry) => entry.text.trim().length > 0)
      .map((entry) =>
        entry.role === 'user'
          ? vscode.LanguageModelChatMessage.User(entry.text)
          : vscode.LanguageModelChatMessage.Assistant(entry.text)
      );

    return [vscode.LanguageModelChatMessage.User(BASE_PROMPT), ...historyMessages];
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
        'Johnny Avakian Presents CISSP Budyy could not reach the selected chat model.',
        '',
        `Error: ${error.message}`
      ].join('\n');
    }

    if (error instanceof Error) {
      return [
        'Johnny Avakian Presents CISSP Budyy hit an unexpected error while preparing your study round.',
        '',
        `Error: ${error.message}`
      ].join('\n');
    }

    return 'Johnny Avakian Presents CISSP Budyy hit an unexpected error while preparing your study round.';
  }

  private postState(): void {
    void this.panel.webview.postMessage({
      type: 'state',
      payload: {
        isBusy: this.isBusy,
        quickPrompts: QUICK_PROMPTS,
        transcript: this.transcript
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'cissp-budyy-logo.svg')
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
    <title>Johnny Avakian Presents CISSP Budyy</title>
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
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 32px;
      }

      .hero,
      .promo,
      .composer,
      .message__bubble,
      .empty-state {
        border: 1px solid var(--border);
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
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

      .hero__eyebrow {
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

      .hero__subtitle {
        max-width: 760px;
        margin: 12px 0 18px;
        color: var(--muted);
        line-height: 1.6;
      }

      .hero__guardrail {
        margin: 18px 0 18px;
        font-size: 13px;
        color: var(--gold);
        letter-spacing: 0.04em;
      }

      .quick-prompts,
      .promo__actions,
      .toolbar,
      .composer__actions,
      .composer__actions-right {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
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

      .transcript {
        display: grid;
        gap: 16px;
        margin: 22px 0 26px;
      }

      .promo {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 18px;
        align-items: center;
        margin-top: 18px;
        padding: 22px 24px;
        border-radius: 24px;
        background:
          linear-gradient(135deg, rgba(216, 177, 92, 0.14), transparent 48%),
          linear-gradient(180deg, rgba(15, 33, 49, 0.92), rgba(9, 22, 36, 0.94));
      }

      .promo__eyebrow {
        margin: 0 0 8px;
        color: var(--gold);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 11px;
      }

      .promo__title {
        margin: 0 0 10px;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(22px, 3vw, 28px);
        line-height: 1.2;
      }

      .promo__body {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      .promo__actions {
        justify-content: flex-end;
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

      .composer {
        position: sticky;
        bottom: 16px;
        padding: 18px;
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(11, 24, 39, 0.94), rgba(8, 18, 30, 0.96)),
          var(--surface);
      }

      .composer__topline {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 12px;
      }

      .composer__label {
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--gold);
      }

      .composer__status {
        color: var(--muted);
        font-size: 13px;
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

      textarea:focus {
        outline: 2px solid rgba(216, 177, 92, 0.35);
        outline-offset: 2px;
      }

      .composer__actions {
        justify-content: space-between;
        margin-top: 14px;
      }

      @media (max-width: 720px) {
        .shell {
          width: calc(100vw - 20px);
          padding-top: 16px;
        }

        .hero,
        .promo,
        .composer,
        .message__bubble,
        .empty-state {
          border-radius: 20px;
        }

        .hero__brand,
        .promo {
          grid-template-columns: 1fr;
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
          <img class="hero__logo" src="${logoUri}" alt="CISSP Budyy logo" />
          <div>
            <p class="hero__eyebrow">Johnny Avakian Presents</p>
            <h1 class="hero__title">CISSP Budyy</h1>
            <p class="hero__subtitle">
              Ask a CISSP question, get a focused explanation, and finish every round with one
              CISSP-style multiple-choice question. Export the session to PDF whenever you want a
              printable review sheet.
            </p>
          </div>
        </div>
        <p class="hero__guardrail">
          Scoped to CISSP study and defensive security guidance only.
        </p>
        <div id="quickPrompts" class="quick-prompts"></div>
      </section>

      <section class="promo">
        <div>
          <p class="promo__eyebrow">Portfolio And Referral Request</p>
          <h2 class="promo__title">
            Referrals for cybersecurity and senior engineer roles would mean a lot.
          </h2>
          <p class="promo__body">
            Johnny is working on posting a CISSP prep blog on the portfolio site. Stars on the
            CISSP Budyy repo and comments on the blog will be deeply appreciated.
          </p>
        </div>
        <div class="promo__actions">
          <button
            class="button--secondary"
            type="button"
            data-external-url="${PORTFOLIO_URL}"
          >
            Portfolio
          </button>
          <button
            class="button--secondary"
            type="button"
            data-external-url="${LINKEDIN_URL}"
          >
            LinkedIn
          </button>
          <button class="button--secondary" type="button" data-external-url="${REPO_URL}">
            Star The Repo
          </button>
        </div>
      </section>

      <main id="transcript" class="transcript"></main>

      <section class="composer">
        <div class="composer__topline">
          <div class="composer__label">Study Composer</div>
          <div id="statusText" class="composer__status">
            Ask a CISSP topic or answer with A, B, C, or D.
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
            </div>
            <div class="composer__actions-right">
              <button id="sendButton" class="button--primary" type="submit">
                Ask CISSP Budyy
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const state = {
        isBusy: false,
        quickPrompts: [],
        transcript: []
      };

      const quickPromptsElement = document.getElementById('quickPrompts');
      const transcriptElement = document.getElementById('transcript');
      const statusTextElement = document.getElementById('statusText');
      const promptForm = document.getElementById('promptForm');
      const promptInput = document.getElementById('promptInput');
      const sendButton = document.getElementById('sendButton');
      const exportButton = document.getElementById('exportButton');
      const resetButton = document.getElementById('resetButton');

      function escapeHtml(value) {
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
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
            '<h2>Johnny Avakian Presents CISSP Budyy is ready.</h2>' +
            '<p>Use one of the starter prompts above, ask your own question, or answer the next quiz with A, B, C, or D. CISSP Budyy will keep the loop focused on one explanation and one question at a time.</p>' +
            '</section>';
          return;
        }

        transcriptElement.innerHTML = state.transcript
          .map((entry) => {
            const roleLabel = entry.role === 'user' ? 'You' : 'CISSP Budyy';
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

      function renderControls() {
        const trimmedInput = promptInput.value.trim();
        promptInput.disabled = state.isBusy;
        sendButton.disabled = state.isBusy || trimmedInput.length === 0;
        exportButton.disabled = state.transcript.length === 0;
        resetButton.disabled = state.transcript.length === 0 || state.isBusy;
        statusTextElement.textContent = state.isBusy
          ? 'CISSP Buddy is preparing your next explanation and question...'
          : 'Ask a CISSP topic or answer with A, B, C, or D.';
      }

      function render() {
        renderQuickPrompts();
        renderTranscript();
        renderControls();
      }

      promptForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = promptInput.value.trim();
        if (!text || state.isBusy) {
          return;
        }

        promptInput.value = '';
        renderControls();
        vscode.postMessage({ type: 'submitPrompt', text });
      });

      promptInput.addEventListener('input', () => {
        renderControls();
      });

        exportButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'exportPdf' });
      });

      resetButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'resetTranscript' });
      });

      quickPromptsElement.addEventListener('click', (event) => {
        const button = event.target.closest('[data-quick-prompt]');
        if (!button || state.isBusy) {
          return;
        }

        vscode.postMessage({
          type: 'quickPrompt',
          text: button.getAttribute('data-quick-prompt') || ''
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

        state.isBusy = event.data.payload.isBusy;
        state.quickPrompts = event.data.payload.quickPrompts;
        state.transcript = event.data.payload.transcript;
        render();
      });

      vscode.postMessage({ type: 'ready' });
      render();
    </script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}
