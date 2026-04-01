# FAQ

## Why Is This A TypeScript VS Code Extension Instead Of A Pure C# Extension?

VS Code chat participants and webviews are implemented through the VS Code extension host, which is JavaScript or TypeScript based. TypeScript is the correct native integration layer for:

- commands
- chat participants
- webviews
- message passing
- Copilot Chat orchestration

That makes TypeScript the right fit for the current product architecture.

## Does The App Use GitHub Copilot?

Yes. CISSP Budyy uses GitHub Copilot Chat for model-backed explanations, quiz turns, grading, and LinkedIn draft generation.

## Does This Replace Copilot Chat?

No. It builds a focused study experience on top of the VS Code ecosystem. The product uses a standalone webview app so the user experience feels intentional and branded instead of like a raw chat transcript.

## Why Does The App Open As Its Own Tab?

The standalone app design creates room for product features that do not fit well in a plain chat window:

- quiz-length controls
- detailed wrong-answer configuration
- PDF export
- LinkedIn draft generation
- in-app documentation
- branding and portfolio calls to action

## What Topics Is The App Allowed To Answer?

The app is intentionally scoped to:

- CISSP topics
- defensive security concepts
- exam-style explanations and quizzes

It is not intended to be a general-purpose chatbot.

## What Happens If A User Asks Something Irrelevant Or Unsafe?

The extension applies local guardrails before calling the model. Those checks reject:

- irrelevant prompts
- offensive or harmful cyber requests
- answer-only quiz inputs when no quiz is active

The model prompts also reinforce the same CISSP-only defensive scope.

## How Does Quiz Length Work?

The quiz-length dropdown controls how many questions the next study session will contain. The supported range is `1` to `10`.

## When Does The Detailed Wrong-Answer Setting Apply?

When enabled, answer review goes deeper and explains why each of the three incorrect choices is wrong. For the clearest behavior, set this before starting a new topic.

## Does PDF Export Need Extra Dependencies?

No. The extension uses a lightweight internal PDF generator and does not rely on a heavyweight external PDF package.

## Where Should A New User Start?

Use this order:

1. `README.md`
2. `docs/USER_GUIDE.md`
3. `docs/TROUBLESHOOTING.md` if needed

## Where Should A Reviewer Or Recruiter Start?

Use this order:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DEMO_SCRIPT.md`

## Where Should A Maintainer Start?

Use this order:

1. `docs/LAUNCHING.md`
2. `docs/TROUBLESHOOTING.md`
3. `docs/ARCHITECTURE.md`

## What Makes This Portfolio-Worthy?

The project demonstrates more than prompt wiring. It shows:

- intentional product design inside VS Code
- stateful AI-assisted quiz orchestration
- safe scoping and local guardrails
- export workflows
- branding and presentation polish
- documentation written for multiple audiences

## What Are Good Demo Topics?

Strong demo topics include:

- zero trust
- due care vs due diligence
- business continuity
- least privilege
- risk management
- incident response

## How Do I Show The Product Professionally?

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the recommended demo sequence and [LAUNCHING.md](LAUNCHING.md) for the setup and validation checklist.
