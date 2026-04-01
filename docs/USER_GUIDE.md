# User Guide

## What CISSP Buddy Does

Johnny Avakian Presents CISSP Buddy is a guided CISSP study application inside Visual Studio Code. It is not a general-purpose chatbot. It is designed to:

- explain CISSP topics in exam-friendly language
- quiz the user on the topic
- review answers
- optionally explain why all three wrong choices are wrong
- generate a LinkedIn post from the studied topic
- export the study session to PDF

## Opening The App

You can open the app in either of these ways:

1. Command Palette
   - Run `Johnny Avakian Presents CISSP Buddy: Open Study App`

2. GitHub Copilot Chat
   - Type `/cissp-buddy`

The app opens as its own editor tab inside VS Code.

## Main Areas Of The App

### Hero Section

This is the branded app header. It explains the purpose of the product and shows starter prompts.

### Portfolio And Referral Section

This section contains buttons for:

- Portfolio
- LinkedIn
- Star The Repo

These open external links in your browser.

### LinkedIn Showcase Draft

This section lets you generate a professional LinkedIn post based on:

- the topic currently typed into the composer, or
- the most recent quiz topic

Buttons:

- `Generate LinkedIn Post`
- `Copy Draft`

### In-App Documentation

This section links directly to the longer GitHub documentation.

### Transcript Area

This area shows the actual study session:

- your prompts
- CISSP Buddy explanations
- quiz questions
- answer reviews
- session wrap-up

### Study Composer

This is where the active study configuration lives.

The composer now behaves like a floating dock so it can stay available without permanently blocking the transcript. On shorter or narrower windows it may start collapsed. Use the composer toggle button to switch between:

- `Open Composer`
- `Collapse`

Controls:

- `Quiz length`
  - choose from `1` to `10`
- `Explain wrong answers in detail`
  - when enabled, the app explains each of the three wrong answer choices separately
- prompt box
  - enter a CISSP topic or answer with `A`, `B`, `C`, or `D`
- `New Session`
- `Export PDF`
- `Ask CISSP Buddy`

### Reading On Smaller Screens

If you are on a lower-resolution display or a shorter editor window:

- collapse the floating composer while reading long answer explanations
- reopen it only when you are ready to ask the next topic or submit `A`, `B`, `C`, or `D`
- the app remembers the collapsed state while the webview stays open

## Recommended Study Flow

1. Choose a quiz length
2. Decide whether detailed wrong-answer review should be on or off
3. Enter a CISSP topic such as:
   - `Explain zero trust`
   - `Quiz me on due diligence`
   - `Teach me business continuity`
   - `fm-200`
4. Read the explanation
5. Answer the quiz question with `A`, `B`, `C`, or `D`
6. Continue until the selected number of questions is complete
7. Generate a LinkedIn post if desired
8. Export the transcript to PDF if you want a saved artifact

## How Quiz Length Works

The quiz length dropdown controls how many questions the app will ask for the next topic you start.

Important behavior:

- the setting applies when a new topic starts
- it does not retroactively rewrite a quiz already in progress
- after a quiz completes, the selected length remains available for the next topic

## How Detailed Wrong-Answer Review Works

When the toggle is off:

- the app gives a concise explanation of why the wrong answers are weaker

When the toggle is on:

- the app explains each of the three wrong answer choices individually
- this usually produces longer and more educational answer reviews

This setting is useful when:

- you want deeper exam reasoning
- you want to learn how distractors differ from the best answer
- you want stronger study artifacts for demos or portfolio screenshots

## How The LinkedIn Post Generator Works

The generator uses:

- the current topic in the composer if one exists, otherwise
- the most recent studied topic

The draft is intended to be:

- professional
- LinkedIn-friendly
- consistent with the product branding

The generated post is not auto-published. You copy it and paste it into LinkedIn yourself.

## PDF Export

`Export PDF` saves the transcript as a PDF file.

This is useful for:

- study review
- client or recruiter demos
- keeping examples of the product output

## What The Guardrails Mean

The app is intentionally scoped.

It will help with:

- CISSP topics
- defensive security concepts
- exam-style questions
- shorthand security terms when the model can reasonably resolve them into a CISSP topic

It will reject:

- irrelevant non-CISSP prompts
- offensive or harmful cyber requests
- requests that fall outside the intended study use case

If you enter a shorthand term like `fm-200`, the app now gives the model a chance to resolve it in a CISSP or defensive security context first. If the response still does not come back as a real security study topic, the app redirects you back to CISSP scope instead of starting a bad quiz.

## Best Demo Topics

If you want the app to look strong in a demo, these topics work well:

- zero trust
- due care vs due diligence
- business continuity
- least privilege
- risk management
- incident response
- security architecture

## End-User Tips

- Use shorter topic prompts for the cleanest output
- Turn on detailed wrong-answer review when you want richer explanations
- Use quiz lengths greater than `1` for stronger demos
- Generate the LinkedIn draft after a completed quiz for better topic framing
- Export the transcript after a good run so you keep a reusable artifact
