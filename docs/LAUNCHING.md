# Launching And Releasing

## Runtime Requirements

- Visual Studio Code `1.110.0` or newer
- GitHub Copilot Chat installed and signed in
- Node.js
- npm

## Launching In Development

1. Install dependencies:

```bash
npm install
```

2. Compile the extension:

```bash
npm run compile
```

3. Start the Extension Development Host:

- Press `F5` in VS Code

4. Open the app in the development host:

- Command Palette:
  - `Johnny Avakian Presents CISSP Budyy: Open Study App`
- Or GitHub Copilot Chat:
  - `/cissp-buddy`

## Packaging A VSIX

Create a VSIX package with:

```bash
npx @vscode/vsce package --no-yarn
```

This produces a file similar to:

```text
cissp-buddy-0.0.4.vsix
```

## Installing The Packaged Extension

Install or update the extension locally with:

```bash
code --install-extension cissp-buddy-0.0.4.vsix --force
```

Verify the installed version:

```bash
code --list-extensions --show-versions
```

## Typical Validation Checklist

- Compile succeeds with `npm run compile`
- VSIX builds successfully with `vsce`
- The branded icon appears in VS Code
- `CISSP Budyy: Open Study App` opens the standalone app
- Quiz length can be selected from `1` to `10`
- A topic launches the guided quiz flow
- Answering `A`, `B`, `C`, or `D` advances the session correctly
- LinkedIn post generation produces a draft
- PDF export saves a transcript
- Guardrails reject irrelevant or unsafe prompts

## Release Notes Guidance

When preparing a new release, update:

- `package.json` version
- `package-lock.json` version
- `README.md` if user-facing behavior changed
- any GitHub docs that describe new workflows

## Demo Flow For LinkedIn Or Portfolio Reviews

Use this sequence to showcase the product professionally:

1. Open the branded standalone app
2. Set quiz length to a value greater than `1`
3. Ask a CISSP topic such as zero trust or due diligence
4. Answer at least one question to show the guided grading loop
5. Generate a LinkedIn post from the same topic
6. Copy the draft
7. Export the transcript to PDF
8. Open the portfolio and repo links from inside the app
