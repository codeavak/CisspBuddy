# Johnny Avakian Presents CISSP Budyy

Johnny Avakian Presents CISSP Budyy is a standalone Visual Studio Code study app for GitHub Copilot. It opens inside VS Code as its own editor tab, explains CISSP topics in exam-friendly language, asks one CISSP-style multiple-choice question per round, and lets you export the session as a PDF.

## Use It In VS Code

1. Install dependencies with `npm install`.
2. Run `npm run compile`.
3. Press `F5` in VS Code to launch the extension development host.
4. Open the Command Palette and run `Johnny Avakian Presents CISSP Budyy: Open Study App`.
5. Or open GitHub Copilot Chat and type `/cissp-buddy` to launch the standalone app from chat.

## What It Does

- Opens a dedicated branded CISSP Budyy panel that feels like a small in-editor app
- Explains CISSP concepts and follows each explanation with one A/B/C/D practice question
- Continues the loop when you answer with `A`, `B`, `C`, or `D`
- Exports the transcript to PDF for later review or printing
- Adds guardrails so it stays focused on CISSP study and defensive security guidance
- Includes portfolio, LinkedIn, and repo-star calls to action inside the app

## Community Callout

- Portfolio: [codeavak/portfolio_website](https://github.com/codeavak/portfolio_website)
- LinkedIn: [codeavak](https://www.linkedin.com/in/codeavak)
- Repo: [codeavak/cisspbuddy](https://github.com/codeavak/cisspbuddy)

Johnny is working on posting a CISSP prep blog on the portfolio site. Stars on the repo and comments on the blog will be appreciated, and referrals for cybersecurity or senior engineer roles are especially welcome.

## Notes

- The app uses the VS Code Language Model API with GitHub Copilot Chat models.
- `/cissp-buddy` acts as a launcher that opens the standalone app and optionally forwards the topic you typed.
