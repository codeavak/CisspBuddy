# Launching And Releasing

## Audience

This guide is for maintainers, reviewers, and anyone who wants a step-by-step path for running, packaging, validating, and shipping Johnny Avakian's CISSP Buddy.

## Runtime Requirements

- Visual Studio Code `1.110.0` or newer
- GitHub Copilot Chat installed and signed in
- Node.js
- npm

## First-Time Local Setup

From the repository root, run:

```bash
npm install
```

Then compile:

```bash
npm run compile
```

If compilation fails, stop there and use [TROUBLESHOOTING.md](TROUBLESHOOTING.md) before trying to launch or package the extension.

## Launching In Development

1. Open the repository in VS Code
2. Press `F5`
3. Wait for the Extension Development Host window to appear
4. In that window, open the app using either:
   - Command Palette: `Johnny Avakian's CISSP Buddy: Open Study App`
   - GitHub Copilot Chat: `/cissp-buddy`

## What A Healthy Development Launch Looks Like

You should see:

- the branded standalone app open in its own editor tab
- quiz-length selection from `1` to `10`
- the detailed wrong-answer explanation toggle
- the prompt composer and quick prompts
- documentation cards, portfolio links, LinkedIn draft tools, and export controls

If the app opens but model responses never arrive, the most likely issue is Copilot Chat availability or sign-in state.

## Packaging A VSIX

Create a package with:

```bash
npx @vscode/vsce package --no-yarn
```

This produces a file similar to:

```text
cissp-buddy-<version>.vsix
```

Example:

```text
cissp-buddy-0.0.6.vsix
```

## Installing Or Updating The Packaged Extension

Install or update the extension locally with:

```bash
code --install-extension cissp-buddy-<version>.vsix --force
```

Example:

```bash
code --install-extension cissp-buddy-0.0.6.vsix --force
```

After installation:

1. Wait a few seconds
2. Run:

```bash
code --list-extensions --show-versions
```

3. Confirm `codeavak.cissp-buddy@<version>` appears
4. Run `Developer: Reload Window` in VS Code if the UI still looks stale

## Release Checklist

Before pushing a release-quality change, verify all of the following:

- `npm run compile` succeeds
- `npx @vscode/vsce package --no-yarn` succeeds
- the latest VSIX installs successfully
- the installed extension version matches the intended release version
- the standalone app opens from the command palette
- `/cissp-buddy` opens the standalone app from Copilot Chat
- quiz length selection works from `1` to `10`
- detailed wrong-answer review can be toggled on and off
- a CISSP topic starts a guided study session
- answering `A`, `B`, `C`, or `D` advances the quiz correctly
- the LinkedIn draft generator produces content
- PDF export produces a file
- irrelevant or unsafe prompts are rejected by the guardrails
- documentation reflects the current behavior

## Versioning And Documentation Updates

When user-facing behavior changes, update:

- `package.json`
- `package-lock.json`
- `README.md`
- any docs in `docs/` that describe the changed behavior
- in-app documentation references if new guides were added

Using version placeholders in commands is preferred in docs unless a concrete example helps the reader.

## Commit And Push Flow

After validation:

1. Review the working tree with `git status`
2. Stage only the intended project files
3. Create a non-interactive commit with a clear release message
4. Push to GitHub
5. Confirm the remote branch reflects the new commit

If unrelated local files exist, leave them untouched unless they are part of the requested change.

## Demo Flow For LinkedIn Or Portfolio Reviews

Use this sequence to showcase the product professionally:

1. Open the branded standalone app
2. Set quiz length to a value greater than `1`
3. Turn on detailed wrong-answer review
4. Ask a CISSP topic such as zero trust or due diligence
5. Answer at least one question to show the guided grading loop
6. Generate a LinkedIn post from the same topic
7. Copy the draft
8. Export the transcript to PDF
9. Open the portfolio and repo links from inside the app

For a presenter-friendly walkthrough, pair this guide with [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
