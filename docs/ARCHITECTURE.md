# Architecture Overview

## Purpose

Johnny Avakian's CISSP Buddy is designed as both a practical CISSP study tool and a portfolio-quality engineering artifact. The product goals are:

- deliver a polished in-editor study workflow instead of a basic AI chat transcript
- keep the AI experience tightly scoped to CISSP and defensive security concepts
- demonstrate thoughtful state management for multi-question quizzes
- provide export and content-generation features that help the product stand out in demos and on LinkedIn

## System Design

The extension uses a standard VS Code extension-host architecture:

1. `src/extension.ts`
   - activates the extension
   - registers commands
   - registers the `/cissp-buddy` chat participant as a launcher into the standalone app

2. `src/panel.ts`
   - owns the webview panel lifecycle
   - maintains transcript state
   - manages the active quiz session
   - coordinates quiz turns, PDF export, LinkedIn draft generation, and clipboard actions
   - streams model output into the UI

3. `src/prompts.ts`
   - centralizes prompt contracts for quiz kickoff, quiz continuation, grading, and LinkedIn post generation
   - keeps the orchestration logic readable and intentionally structured

4. `src/guardrails.ts`
   - applies local relevance and safety checks before the model is called
   - allows CISSP topics and quiz answers
   - blocks irrelevant prompts and unsafe offensive-security requests

5. `src/pdf.ts`
   - creates PDF output without adding a heavyweight PDF dependency
   - generates a transcript artifact suitable for demos, sharing, and study review

6. `media/`
   - contains brand assets for the extension tile and in-app experience

## How The Code Maps To The Product

The codebase is deliberately organized by responsibility so the visible product experience is easy to trace:

- command and chat entry points live in `src/extension.ts`
- the standalone app experience lives in `src/panel.ts`
- model instructions live in `src/prompts.ts`
- local safety and relevance logic lives in `src/guardrails.ts`
- export generation lives in `src/pdf.ts`

This separation keeps the extension easier to explain, easier to review, and easier to extend without mixing UI, prompt design, and safety logic together.

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

- it uses the current composer topic or the last studied topic
- it calls the model with a focused content-authoring prompt
- it stores the output as a separate `LinkedInDraft`
- it supports copy-to-clipboard without polluting the quiz transcript

This separation helps the app demonstrate product breadth while keeping the study experience clean.

## Guardrail Strategy

The extension uses two complementary guardrail layers:

1. Local deterministic checks
   - CISSP relevance screening
   - defensive or offensive misuse filtering
   - active-quiz validation for answer-only inputs

2. Prompt-level model instructions
   - defensive framing
   - CISSP-only scope
   - structured quiz behavior
   - refusal to provide harmful cyber misuse guidance

The local checks prevent obviously wrong or unsafe requests from reaching the model, while the prompt contract shapes high-quality responses for allowed requests.

## Why The Webview Matters

The webview is a core product decision, not just a UI choice:

- it lets the extension feel like a standalone app inside VS Code
- it creates room for product features beyond chat:
  - quiz-length controls
  - LinkedIn draft studio
  - documentation cards
  - branded calls to action
- it improves the project's value as a portfolio showcase

## Engineering Tradeoffs

- the extension host is TypeScript because that is the native integration model for VS Code chat participants and webviews
- the PDF generator is lightweight and dependency-free to reduce package weight and review complexity
- quiz-state orchestration is kept in the extension rather than trusting the model alone, which improves consistency for multi-question sessions
- documentation is duplicated in both the app and GitHub because the project serves both end users and portfolio reviewers

## Documentation As Part Of The Architecture

Documentation is treated as a product feature, not a project afterthought:

- the app contains summary-level documentation for live demos
- GitHub contains deeper references for users, reviewers, and maintainers
- the docs are cross-linked so setup, architecture, troubleshooting, and showcase flows can be followed without guesswork

That decision matters because this project is meant to function as both a usable study assistant and a professional portfolio artifact.

## Key Files

- `src/extension.ts`
- `src/panel.ts`
- `src/prompts.ts`
- `src/guardrails.ts`
- `src/pdf.ts`
- `media/cissp-buddy-icon.png`
- `media/cissp-buddy-logo.svg`
