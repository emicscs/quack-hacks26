# Euler's Vision

Euler's Vision is a hackathon project that makes graph exploration more accessible by combining:

- visual graphing,
- keyboard navigation,
- real-time sonification,
- and optional AI-generated spoken graph descriptions.

Users can enter one or more functions, move along the graph using arrow keys, and hear pitch and event cues for key mathematical behavior (minima, maxima, inflection points, intersections).

---

## Table of Contents

- [Hackathon Overview](#hackathon-overview)
- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Run](#run)
  - [Option A: Full mode (recommended)](#option-a-full-mode-recommended)
  - [Option B: Static mode (no AI descriptions)](#option-b-static-mode-no-ai-descriptions)
- [Directions / How to Use](#directions--how-to-use)
- [Feature Descriptions](#feature-descriptions)
- [Controls](#controls)
- [Troubleshooting](#troubleshooting)

---

## Hackathon Overview

### Problem
Graph-heavy math tools are mostly visual, which can make exploration difficult for blind and low-vision learners.

### Solution
Euler's Vision translates graph behavior into sound while preserving familiar graphing interactions. It adds critical-point cues and optional spoken AI summaries so users can understand graph shape and behavior through multiple modalities.

### Outcome
A web app with:
- sonified graph navigation,
- multi-function plotting,
- critical point and intersection cues,
- and optional Gemini-powered graph narration.

---

## What It Does

- Graphs mathematical functions in real time.
- Lets users move along x with keyboard controls and hear y as pitch.
- Detects and marks local minima, maxima, inflection points, and intersections.
- Plays distinct sounds when crossing important points.
- Supports multiple functions with visibility toggles.
- Provides a **describe graph** action to generate spoken mathematical summaries via Gemini (when backend is enabled).

---

## Tech Stack

- **Languages:** JavaScript, HTML, CSS
- **Frontend:** Plotly.js, Math.js, KaTeX
- **Audio:** Web Audio API, SpeechSynthesis API
- **Backend (optional):** Node.js, Express, dotenv, `@google/genai`
- **AI Model:** `gemini-3-flash-preview`

---

## Project Structure

| Path | Purpose |
|------|--------|
| `index.html` | Landing page |
| `graph-mode.html` | Main sonified exploration UI |
| `desmos.html` | Multi-expression calculator-style graphing page |
| `criticalPointDetector.js` | Critical point/intersection detection and audio cues |
| `js/math-engine.js` | Expression normalization, parsing, evaluation, sampling |
| `js/graph-state.js` | Graph state + cursor + keyboard navigation + Plotly draw loop |
| `js/sonification.js` | Base pitch sonification and UI cue sounds |
| `js/describe-api.js` | Frontend client for `/api/describe` |
| `server/index.js` | Express server + Gemini description endpoint |

---

## Setup

> Serve over **HTTP** (not `file://`) so audio/CDN/API features work correctly.

### Prerequisites

- Node.js 18+
- npm

### Optional AI setup (Gemini)

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Create environment file:

```bash
cd server
cp .env.example .env
```

3. Add key in `server/.env`:

```env
GEMINI_API_KEY=your_actual_key_here
PORT=3000
```

---

## Run

## Option A: Full mode (recommended)

Runs frontend + backend + AI describe endpoint.

```bash
cd server
npm install
npm start
```

Open:
- `http://localhost:3000/index.html`
- `http://localhost:3000/graph-mode.html`
- `http://localhost:3000/desmos.html`

## Option B: Static mode (no AI descriptions)

```bash
# from project root
python3 -m http.server 8765
# or
npx serve -p 8765
```

Open:
- `http://localhost:8765/index.html`
- `http://localhost:8765/graph-mode.html`

---

## Directions / How to Use

1. Open **Graph Mode**.
2. Enter a function (examples: `sin(x)`, `x^2`, `|x|`, `sqrt(x)`).
3. Use **left/right arrow keys** to move along the graph.
4. Listen to:
   - continuous pitch (mapped from y-value),
   - special cues at minima/maxima/inflection/intersections.
5. Add more functions and compare curves.
6. Click **describe graph** (if backend is running) to hear an AI-generated spoken summary.

---

## Feature Descriptions

### 1) Sonified Graph Navigation
- Cursor-based movement along x.
- Y-value converted to pitch in real time.
- Designed for keyboard-first graph exploration.

### 2) Critical Point Feedback
- Detects:
  - local minima,
  - local maxima,
  - inflection points.
- Adds visual markers and crossing sounds.

### 3) Multi-Function Graphing
- Add multiple functions dynamically.
- Toggle visibility per function.
- Color-coded traces.
- Intersection detection between visible functions.

### 4) Describe Graph (AI)
- Captures current graph image + equation(s).
- Sends to `POST /api/describe`.
- Gemini returns a plain-language math description.
- Browser reads it aloud with SpeechSynthesis.

---

## Controls

- **Left Arrow / Right Arrow:** move graph cursor
- **Up Arrow / Down Arrow:** adjust step interval
- **Step size input:** control movement increment
- **Max sound duration:** cap continuous tone duration
- **Stop at critical points:** navigation behavior option
- **Function visibility toggles:** show/hide traces
- **describe graph:** generate spoken graph description (backend mode)

---

## Troubleshooting

- **No sound at first:**  
  Browser autoplay restrictions may require an initial user interaction.

- **Describe graph fails:**  
  Ensure backend is running and `GEMINI_API_KEY` is set in `server/.env`.

- **Graph not rendering correctly:**  
  Confirm you are using `http://...`, not opening HTML directly with `file://`.

- **Unexpected expression behavior:**  
  Use standard forms (`sin(x)`, `x^2`, `sqrt(x)`, `abs(x)`) or shorthand supported by the parser (`|x|`, `π`, `√x`).

---

## Hackathon Tagline

**Euler's Vision** helps users hear the shape of mathematics.
