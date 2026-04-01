# Architecture Overview

## Purpose

Johnny Avakian Presents CISSP Budyy is designed as both a practical CISSP study tool and a portfolio-quality engineering artifact. The product goals are:

- Deliver a polished in-editor study workflow instead of a basic AI chat transcript
- Keep the AI experience tightly scoped to CISSP and defensive security concepts
- Demonstrate thoughtful state management for multi-question quizzes
- Provide export and content-generation features that help the product stand out in demos and on LinkedIn

## System Design

The extension uses a standard VS Code extension-host architecture:

1. `src/extension.ts`
   - Activates the extension
   - Registers commands
   - Registers the `/cissp-buddy` chat participant as a launcher into the standalone app

2. `src/panel.ts`
   - Owns the webview panel lifecycle
   - Maintains transcript state
   - Manages the active quiz session
   - Coordinates quiz turns, PDF export, LinkedIn draft generation, and clipboard actions
   - Streams model output into the UI

3. `src/prompts.ts`
   - Centralizes prompt contracts for:
     - quiz kickoff
     - quiz continuation and grading
     - LinkedIn post generation
   - Keeps the orchestration logic readable and intentionally structured

4. `src/guardrails.ts`
   - Applies local relevance and safety checks before the model is called
   - Allows CISSP topics and quiz answers
   - Blocks irrelevant prompts and unsafe offensive-security requests

5. `src/pdf.ts`
   - Creates PDF output without adding a heavyweight PDF dependency
   - Generates a transcript artifact suitable for demos, sharing, and study review

6. `media/`
   - Contains brand assets for the extension tile and in-app experience

## Quiz Flow

The quiz experience is not delegated entirely to the model. The extension maintains quiz intent and progression explicitly:

1. The user chooses a quiz length from `1` to `10`
2. A new topic starts a `QuizSession`
3. The prompt contract instructs the model to:
   - explain the concept
   - ask question `1 of N`
   - stop before revealing the answer
   - honor the selected wrong-answer review depth
4. When the user replies with `A`, `B`, `C`, or `D`, the extension:
   - validates that a question is actually waiting for an answer
   - sends the full session context plus a grading instruction
   - updates the session counter
5. The final question ends with:
   - answer review
   - explanation
   - brief wrap-up
   - no extra follow-up question

This structure makes the app feel guided and intentional instead of probabilistic and chatty.

## Review-Depth Configuration

The app includes a user-facing configuration for distractor review depth:

- default mode gives a concise explanation of why the remaining options are weaker
- detailed mode explains each of the three wrong options individually

This is handled as application state, not as a loose UI hint, so each grading turn receives explicit prompt instructions about how deeply to explain the distractors.

## LinkedIn Post Generator

The LinkedIn generator is intentionally separate from the quiz transcript flow:

- It uses the current composer topic or the last studied topic
- It calls the model with a focused content-authoring prompt
- It stores the output as a separate `LinkedInDraft`
- It supports copy-to-clipboard without polluting the quiz transcript

This separation helps the app demonstrate product breadth while keeping the study experience clean.

## Guardrail Strategy

The extension uses two complementary guardrail layers:

1. Local deterministic checks
   - CISSP relevance screening
   - defensive/offensive misuse filtering
   - active-quiz validation for answer-only inputs

2. Prompt-level model instructions
   - defensive framing
   - CISSP-only scope
   - structured quiz behavior
   - refusal to provide harmful cyber misuse guidance

The local checks prevent obviously wrong or unsafe requests from reaching the model, while the prompt contract shapes high-quality responses for allowed requests.

## Why The Webview Matters

The webview is a core product decision, not just a UI choice:

- It lets the extension feel like a standalone app inside VS Code
- It creates room for product features beyond chat:
  - quiz-length controls
  - LinkedIn draft studio
  - documentation cards
  - branded calls to action
- It improves the project’s value as a portfolio showcase

## Engineering Tradeoffs

- The extension host is TypeScript because that is the native integration model for VS Code chat participants and webviews
- The PDF generator is lightweight and dependency-free to reduce package weight and review complexity
- Quiz-state orchestration is kept in the extension rather than trusting the model alone, which improves consistency for multi-question sessions
- Documentation is duplicated in both the app and GitHub because the project serves both end users and portfolio reviewers

## Key Files

- `src/extension.ts`
- `src/panel.ts`
- `src/prompts.ts`
- `src/guardrails.ts`
- `src/pdf.ts`
- `media/cissp-budyy-icon.png`
- `media/cissp-budyy-logo.svg`
