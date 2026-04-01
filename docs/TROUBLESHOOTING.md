# Troubleshooting Guide

## Quick Triage Checklist

If something is not working, check these first:

1. VS Code is `1.110.0` or newer
2. GitHub Copilot Chat is installed
3. You are signed in to Copilot
4. `npm install` has been run
5. `npm run compile` succeeds
6. The latest VSIX is installed
7. VS Code has been reloaded after installation

## The App Does Not Open

### Symptom

- Running the command does nothing
- `/cissp-buddy` does not open the standalone app

### Checks

- Open the Command Palette and search for:
  - `Johnny Avakian's CISSP Buddy: Open Study App`
- If it is missing:
  - confirm the extension is installed
  - reload VS Code with `Developer: Reload Window`
  - reinstall the VSIX

### Reinstall Command

```bash
code --install-extension cissp-buddy-0.0.21.vsix --force
```

## The App Opens But Responses Never Arrive

### Symptom

- the app opens
- prompts are accepted
- no explanation or quiz appears

### Likely Cause

- Copilot Chat model access is unavailable

### Fix

- confirm GitHub Copilot Chat is installed
- confirm you are signed in
- confirm Copilot works elsewhere in VS Code
- try reloading VS Code

## Compile Fails

### Command

```bash
npm run compile
```

### Checks

- confirm `npm install` was run first
- confirm Node.js and npm are installed
- confirm the repo was not partially edited or interrupted

## The Wrong Version Is Still Showing In VS Code

### Symptom

- a newer VSIX installs successfully
- VS Code still appears to show the older version

### Fix

1. Wait a few seconds
2. Run:

```bash
code --list-extensions --show-versions
```

3. Reload the window with `Developer: Reload Window`

VS Code can briefly lag before the extension list reflects the latest installed version.

## The LinkedIn Draft Button Produces Nothing

### Checks

- make sure there is:
  - a topic currently typed in the composer, or
  - a previously studied quiz topic
- make sure the topic is CISSP-related
- make sure Copilot model access is working

## The App Looks Locked On First Launch

### Why This Happens

The app now requires a first-use legal acceptance before the study workflow unlocks.

### What To Do

- read the notice
- check the acceptance box
- click `Accept Terms And Continue`

If a topic was launched from `/cissp-buddy`, it will start automatically after acceptance.

If you had accepted an older version already, the app may ask again after a legal wording update because the acceptance gate is now versioned.

## PDF Export Does Not Produce A File

### Checks

- make sure the transcript is not empty
- make sure you selected a save location
- make sure VS Code has permission to write to the chosen folder

## The App Rejects My Prompt

### Why This Happens

The app contains local guardrails. It only accepts:

- CISSP topics
- defensive security topics
- quiz-answer turns like `A`, `B`, `C`, or `D`

It rejects:

- irrelevant prompts
- offensive or unsafe security requests

### What To Do

Rephrase the request as a CISSP study question, for example:

- `Explain zero trust for CISSP`
- `Quiz me on due diligence`
- `Teach me business continuity`

## Detailed Wrong-Answer Review Does Not Seem To Apply

### Expected Behavior

The toggle affects the grading depth for the active or next quiz flow.

### Best Practice

- set the toggle before starting a new topic
- if needed, start a new session and restart the topic so the effect is obvious

## I Want A Reliable Demo Flow

Use the demo sequence in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## I Want To Inspect The Architecture

Use [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## I Need Step-By-Step Launch Instructions

Use [docs/LAUNCHING.md](docs/LAUNCHING.md).

## I Just Want To Use The App As An End User

Use [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
