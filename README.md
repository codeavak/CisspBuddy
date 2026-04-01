# CISSP Buddy

CISSP Buddy is a Visual Studio Code chat participant for GitHub Copilot Chat. Ask it a CISSP question and it will explain the concept, then follow up with exactly one CISSP-style multiple-choice question to reinforce the topic.

## Use It In VS Code

1. Install dependencies with `npm install`.
2. Run `npm run compile`.
3. Press `F5` in VS Code to launch the extension development host.
4. Open GitHub Copilot Chat and type `/cissp-buddy`.
5. Ask a CISSP question, or just submit `/cissp-buddy` with no extra text to start a random study round.

## Example Prompts

- `/cissp-buddy Explain least privilege`
- `/cissp-buddy What is due diligence?`
- `/cissp-buddy Quiz me on incident response`

## What It Does

- Explains CISSP concepts in exam-friendly language
- Asks one multiple-choice CISSP-style question after each explanation
- Keeps the practice loop going when you answer with `A`, `B`, `C`, or `D`

## Notes

- This extension depends on the chat features available in VS Code and GitHub Copilot Chat.
- The chat participant integration is implemented as a standard VS Code extension host project.
