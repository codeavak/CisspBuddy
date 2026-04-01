# Johnny Avakian Presents CISSP Buddy

Johnny Avakian Presents CISSP Buddy is a portfolio-grade Visual Studio Code extension that turns GitHub Copilot into a branded CISSP study experience. It opens as a standalone app inside VS Code, explains CISSP topics in exam-friendly language, runs guided multi-question quizzes, exports transcripts to PDF, and generates showcase-ready LinkedIn posts from the topic you studied.

## What This Project Demonstrates

- Product thinking for a polished in-editor study workflow
- Safe AI orchestration with local guardrails and scoped prompts
- Guided quiz state management across multiple questions
- Configurable wrong-answer review depth
- Professional branding, export workflows, and LinkedIn-friendly output
- Documentation intended for users, reviewers, recruiters, and collaborators

## Feature Summary

- Standalone app experience inside VS Code instead of a plain chat thread
- Configurable quiz length from `1` to `10` questions per study topic
- Floating study composer dock with an open or collapse control for smaller screens
- Shorthand topic resolution for prompts like `fm-200`, with a second-stage security relevance check
- Optional detailed explanations for all three wrong answer choices
- Interactive answer review with follow-up questions until the selected quiz count is complete
- LinkedIn post generator based on the studied topic
- PDF export for demos, study review, and portfolio artifacts
- In-app documentation with direct links to GitHub docs
- Portfolio, LinkedIn, repo-star, and referral calls to action
- Guardrails that keep the assistant focused on CISSP and defensive security guidance

## Foolproof Quick Start

### Runtime Requirements

- Visual Studio Code `1.110.0` or newer
- GitHub Copilot Chat installed and signed in
- Node.js
- npm

### First-Time Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Compile the extension:

```bash
npm run compile
```

4. Launch the Extension Development Host:

- Press `F5` in VS Code

5. Open the app in the development host:

- Command Palette: `Johnny Avakian Presents CISSP Buddy: Open Study App`
- Or in Copilot Chat: `/cissp-buddy`

### Packaging And Local Install

Create a VSIX package:

```bash
npx @vscode/vsce package --no-yarn
```

Install the packaged extension:

```bash
code --install-extension cissp-buddy-0.0.6.vsix --force
```

If VS Code still shows the previous version after install, run `Developer: Reload Window`.

## Documentation Index

- [User Guide](docs/USER_GUIDE.md)
- [FAQ](docs/FAQ.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Launching And Releasing](docs/LAUNCHING.md)
- [Demo Script](docs/DEMO_SCRIPT.md)

## Recommended Reading Order

If you are evaluating the project for quality, portfolio presentation, or technical depth, this is the fastest path:

1. Read this README for the product and setup summary
2. Open [docs/USER_GUIDE.md](docs/USER_GUIDE.md) to understand the actual study flow
3. Open [docs/FAQ.md](docs/FAQ.md) for the practical design and behavior questions reviewers usually ask
4. Open [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the implementation model
5. Open [docs/LAUNCHING.md](docs/LAUNCHING.md) for build, packaging, install, validation, and release steps
6. Open [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a polished showcase walkthrough
7. Use [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) if setup or runtime issues appear

## Documentation Promise

The documentation is intentionally split so each audience can find what they need quickly:

- End users should start with the User Guide and FAQ
- Reviewers and recruiters should read the README, Architecture Overview, and Demo Script
- Maintainers should use Launching And Releasing plus the Troubleshooting Guide
- In-app documentation mirrors this structure so the product remains self-explanatory during demos

## Community And Portfolio Links

- Portfolio: [codeavak.github.io/portfolio_website](https://codeavak.github.io/portfolio_website/)
- LinkedIn: [codeavak](https://www.linkedin.com/in/codeavak)
- Repo: [codeavak/cisspbuddy](https://github.com/codeavak/cisspbuddy)

Johnny is working on posting a CISSP prep blog on the portfolio site. Stars on the repo and comments on the blog are appreciated, and referrals for cybersecurity or senior engineer roles are especially welcome.
