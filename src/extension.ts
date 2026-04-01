import * as vscode from 'vscode';

const PARTICIPANT_ID = 'cisspbuddy.cissp-buddy';

const BASE_PROMPT = [
  'You are CISSP Buddy, a focused CISSP study coach.',
  'Help the user understand CISSP concepts with clear, concise explanations that reflect the exam mindset.',
  'After every concept explanation, ask exactly one CISSP-style multiple-choice question with four options labeled A, B, C, and D.',
  'There must be exactly one best answer.',
  'End quiz turns by inviting the user to reply with A, B, C, or D.',
  'If the user responds with an answer to the previous question, grade it first, explain the correct answer in CISSP terms, explain briefly why the other options are weaker, and then ask one new question.',
  'Keep the tone encouraging and exam-focused.',
  'Prefer short sections and bullets over long essays.',
  'Do not answer non-CISSP topics beyond a brief redirection back to CISSP study.'
].join(' ');

function buildCurrentTurnPrompt(request: vscode.ChatRequest): string {
  const rawPrompt = request.prompt.trim();

  if (request.command === 'cissp-buddy' && rawPrompt.length === 0) {
    return [
      'Start a CISSP study round.',
      'Pick a high-value CISSP topic, explain it simply, and then ask one exam-style multiple-choice question.'
    ].join(' ');
  }

  return [
    'Respond to this CISSP study request and maintain the quiz flow described earlier.',
    rawPrompt
  ].join('\n\n');
}

function historyToMessages(
  history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]
): vscode.LanguageModelChatMessage[] {
  const messages: vscode.LanguageModelChatMessage[] = [];

  for (const turn of history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      const prompt = turn.prompt.trim();
      if (prompt.length > 0) {
        messages.push(vscode.LanguageModelChatMessage.User(prompt));
      }
      continue;
    }

    if (turn instanceof vscode.ChatResponseTurn) {
      let responseText = '';

      for (const part of turn.response) {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          responseText += part.value.value;
        }
      }

      if (responseText.trim().length > 0) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
      }
    }
  }

  return messages;
}

export function activate(context: vscode.ExtensionContext): void {
  const handler: vscode.ChatRequestHandler = async (
    request,
    chatContext,
    stream,
    token
  ) => {
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(BASE_PROMPT),
      ...historyToMessages(chatContext.history),
      vscode.LanguageModelChatMessage.User(buildCurrentTurnPrompt(request))
    ];

    try {
      const response = await request.model.sendRequest(messages, {}, token);

      for await (const fragment of response.text) {
        stream.markdown(fragment);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stream.markdown(
        [
          'CISSP Buddy could not reach the selected chat model.',
          '',
          `Error: ${message}`
        ].join('\n')
      );
    }
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('shield');
  participant.followupProvider = {
    provideFollowups() {
      return [
        {
          prompt: 'Explain due care vs due diligence and quiz me.',
          label: 'Due care vs due diligence'
        },
        {
          prompt: 'Quiz me on security architecture and design.',
          label: 'Security architecture quiz'
        },
        {
          prompt: 'Explain business continuity planning and ask one question.',
          label: 'Business continuity'
        }
      ];
    }
  };

  context.subscriptions.push(participant);
}

export function deactivate(): void {}

