# Johnny Avakian Presents CISSP Budyy

Johnny Avakian Presents CISSP Budyy is a portfolio-grade Visual Studio Code extension that turns GitHub Copilot into a branded CISSP study experience. It opens as a standalone app inside VS Code, explains CISSP topics in exam-friendly language, runs guided multi-question quizzes, exports transcripts to PDF, and generates showcase-ready LinkedIn posts from the topic you studied.

## Why This Project Exists

This project is intentionally built to showcase more than a simple chat wrapper. It demonstrates:

- Product thinking for a polished in-editor study workflow
- Safe AI orchestration with local guardrails and scoped prompts
- Guided quiz state management across multiple questions
- Professional branding, portfolio calls to action, and export workflows
- Clear engineering documentation for reviewers, recruiters, and collaborators

## Showcase Features

- Standalone app experience inside VS Code instead of a plain chat thread
- Configurable quiz length from 1 to 10 questions per study topic
- Configurable wrong-answer review depth so users can ask for detailed explanations of all three distractors
- Interactive answer review with explanations and follow-up questions until the selected quiz count is complete
- LinkedIn post generator that produces a professional draft from the studied topic
- PDF export for study sessions and demos
- In-app documentation that explains why the product exists, how it works, and how to launch it
- Portfolio, LinkedIn, repo-star, and referral calls to action in the product UI
- Guardrails that keep the assistant focused on CISSP and defensive security guidance

## Launch Requirements

- Visual Studio Code `1.110.0` or newer
- GitHub Copilot Chat access and sign-in
- Node.js
- npm

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Compile the extension:

```bash
npm run compile
```

3. Launch the Extension Development Host:

- Press `F5` in VS Code

4. Open the app:

- Command Palette: `Johnny Avakian Presents CISSP Budyy: Open Study App`
- Or in Copilot Chat: `/cissp-buddy`

## Packaging

Create a VSIX package with:

```bash
npx @vscode/vsce package --no-yarn
```

Install the VSIX locally with:

```bash
code --install-extension cissp-buddy-0.0.5.vsix --force
```

## Documentation

- Architecture and implementation notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Launch requirements and release flow: [docs/LAUNCHING.md](docs/LAUNCHING.md)

## Community And Portfolio Links

- Portfolio: [codeavak/portfolio_website](https://github.com/codeavak/portfolio_website)
- LinkedIn: [codeavak](https://www.linkedin.com/in/codeavak)
- Repo: [codeavak/cisspbuddy](https://github.com/codeavak/cisspbuddy)

Johnny is working on posting a CISSP prep blog on the portfolio site. Stars on the repo and comments on the blog are appreciated, and referrals for cybersecurity or senior engineer roles are especially welcome.
