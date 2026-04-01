# CISSP Buddy

CISSP Buddy is a standalone Visual Studio Code study app for GitHub Copilot. It opens inside VS Code as its own editor tab, explains CISSP topics in exam-friendly language, asks one CISSP-style multiple-choice question per round, and lets you export the session as a PDF.

## Use It In VS Code

1. Install dependencies with `npm install`.
2. Run `npm run compile`.
3. Press `F5` in VS Code to launch the extension development host.
4. Open the Command Palette and run `CISSP Buddy: Open Study App`.
5. Or open GitHub Copilot Chat and type `/cissp-buddy` to launch the standalone app from chat.

## What It Does

- Opens a dedicated CISSP Buddy panel that feels like a small in-editor app
- Explains CISSP concepts and follows each explanation with one A/B/C/D practice question
- Continues the loop when you answer with `A`, `B`, `C`, or `D`
- Exports the transcript to PDF for later review or printing
- Adds guardrails so it stays focused on CISSP study and defensive security guidance

## Example Prompts

- `Explain least privilege`
- `What is due care vs due diligence?`
- `Quiz me on incident response`
- `C`

## Notes

- The app uses the VS Code Language Model API with GitHub Copilot Chat models.
- `/cissp-buddy` now acts as a launcher that opens the standalone app and optionally forwards the topic you typed.
