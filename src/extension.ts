import * as vscode from 'vscode';

import { CisspBuddyPanel } from './panel';
import { buildLaunchPrompt } from './prompts';

const PARTICIPANT_ID = 'cisspbuddy.cissp-buddy';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cisspBuddy.openApp', async () => {
      CisspBuddyPanel.createOrShow();
    }),
    vscode.commands.registerCommand('cisspBuddy.exportTranscriptPdf', async () => {
      const panel = CisspBuddyPanel.current();
      if (!panel) {
        await vscode.window.showInformationMessage(
          'Open CISSP Buddy first, then export the transcript from there.'
        );
        return;
      }

      await panel.exportTranscript();
    })
  );

  const handler: vscode.ChatRequestHandler = async (
    request,
    _chatContext,
    stream,
    _token
  ) => {
    const panel = CisspBuddyPanel.createOrShow();
    const launchPrompt = buildLaunchPrompt(
      request.prompt,
      request.command === 'cissp-buddy'
    );

    if (launchPrompt) {
      void panel.ask(launchPrompt);
      stream.markdown(
        'Opened CISSP Buddy in a standalone editor tab and sent your topic there.'
      );
      return;
    }

    stream.markdown('Opened CISSP Buddy in a standalone editor tab. Continue there.');
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('shield');
  participant.followupProvider = {
    provideFollowups() {
      return [
        {
          prompt: 'Open CISSP Buddy and explain due care vs due diligence.',
          label: 'Launch due care topic'
        },
        {
          prompt: 'Launch CISSP Buddy with a security architecture quiz.',
          label: 'Open architecture quiz'
        },
        {
          prompt: 'Start CISSP Buddy and explain business continuity planning.',
          label: 'Open continuity topic'
        }
      ];
    }
  };

  context.subscriptions.push(participant);
}

export function deactivate(): void {}
