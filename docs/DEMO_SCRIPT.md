# Demo Script

## Goal

This script is designed to help Johnny Avakian explain CISSP Buddy clearly on LinkedIn, in interviews, or in product walkthroughs.

## Setup

Before the demo:

1. Install the latest VSIX
2. Reload VS Code
3. Open the standalone app
4. Make sure Copilot Chat is signed in and working

## Recommended Demo Flow

1. Open the app and let the branding sit on screen for a moment
2. Point out that it is a standalone experience inside VS Code, not just a chat thread
3. Set:
   - quiz length to `3`
   - `Explain wrong answers in detail` to on
4. Enter a topic such as:
   - `Explain zero trust for CISSP`
5. Highlight that the app:
   - explains the topic
   - asks `Question 1 of 3`
   - keeps the answer hidden until the user responds
6. Answer with a wrong choice intentionally, such as `B`
7. Show that the app:
   - grades the answer
   - explains the correct answer
   - explains why the three distractors are wrong
   - continues to the next question automatically
8. Generate a LinkedIn post from the topic
9. Copy the draft
10. Export the transcript to PDF
11. Open the website and repo links from inside the app

## Talking Points

- The product is scoped intentionally to CISSP and defensive security
- The quiz flow is stateful and guided, not just free-form prompting
- Wrong-answer review depth is configurable
- The app creates reusable study outputs:
  - LinkedIn post drafts
  - PDF study transcripts
- The documentation is designed for both learners and maintainers

## Best Demo Topics

- zero trust
- due care vs due diligence
- least privilege
- risk management
- business continuity
- incident response

## What To Avoid During A Demo

- unrelated prompts
- offensive or unsafe security prompts
- topics outside CISSP scope
- starting the demo before Copilot access is confirmed
