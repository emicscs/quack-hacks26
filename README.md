# Audible Math

A web-based mathematical sonification engine that turns function graphs into sound. Pitch corresponds to the function’s y-value; you move along the x-axis with the arrow keys. The app includes **Graph Mode** (sonified exploration with critical-point feedback), a **Desmos-style graphing calculator**, and an optional **Node backend** for AI-generated graph descriptions.

## Features

- **Graph Mode** – Pick a function, explore with ← / →. Pitch reflects y; voice intro and critical-point sounds (minima, maxima, inflection) when the cursor crosses them.
- **Critical point detector** – Marks local minima (green ▼), maxima (red ▲), and inflection points (blue ◆) on the graph; plays distinct beeps when you cross them. See [IMPLEMENTING_CRITICAL_POINTS.md](IMPLEMENTING_CRITICAL_POINTS.md) for integration details.
- **Desmos-style calculator** (`desmos.html`) – Multiple expressions, Plotly graph, KaTeX rendering.
- **Optional backend** – Express server that serves the app and provides `/api/describe` (Gemini) for generating spoken descriptions of equations and graph images.

## How to run

You must serve the project over **HTTP** (not `file://`) so CDN scripts, Web Audio, and (if used) the describe API work correctly.

### With the Node backend (recommended)

The backend serves the whole project and powers the **Describe function** feature (Gemini vision + spoken description). You need a **Gemini API key** for that.

**Setup (Gemini API key):**

1. Get a key at [Google AI Studio](https://aistudio.google.com/apikey).
2. In the project, copy the example env file and add your key:
   ```bash
   cd server
   cp .env.example .env
   ```
3. Edit `server/.env` and set:
   ```bash
   GEMINI_API_KEY=your_actual_key_here
   ```
   Do not commit `.env` (it is typically in `.gitignore`). The app reads the key from `server/.env` when the server starts.

**Run the server:**

```bash
cd server
npm install
npm start
```

Then open **http://localhost:3000** (or the port in `server/.env` via `PORT`). From there you can open `index.html`, `graph-mode.html`, or `desmos.html`.

**Describe function:** In Graph Mode, use the “Describe function” button. The app sends your equation and a snapshot of the graph to Gemini (`gemini-3-flash-preview`), which returns a short mathematical description (type, bounds, asymptotes, etc.). **The audio you hear is read from that description** using the browser’s Speech Synthesis API (dictation/TTS). Debug output is printed in the **server console** after each describe request (equation, image size, full description).

### Static only (no backend)

If you don’t need the describe API, serve the project with any static server:

```bash
# Python 3
python3 -m http.server 8765

# or
npx serve -p 8765
```

Then open **http://localhost:8765** and navigate to `index.html` or `graph-mode.html`. Graph Mode and the critical point detector work without the backend.

## Project structure

| Path | Purpose |
|------|--------|
| `index.html` | Landing page; link to Graph Mode |
| `graph-mode.html` | Sonified graph exploration (Plotly, cursor, critical points) |
| `desmos.html` | Desmos-style multi-expression graphing |
| `criticalPointDetector.js` | Standalone critical-point detection, marks, and crossing sounds |
| `js/math-engine.js` | Expression parsing and sampling (Math.js) |
| `js/graph-state.js` | Graph state, cursor, Plotly updates for Graph Mode |
| `js/sonification.js` | Web Audio pitch-from-y sonification |
| `js/voice-intro.js` | Speech Synthesis intro for Graph Mode |
| `js/describe-api.js` | Client for `POST /api/describe` |
| `server/` | Express app: static site + `/api/describe` (Gemini) |

## Dependencies

### Frontend (CDN)

| Dependency | Use |
|------------|-----|
| **Plotly.js** | Graphing (Graph Mode, Desmos-style) |
| **Math.js** | Parsing and evaluating expressions |
| **KaTeX** | (Desmos-style only) Equation rendering |

Sound uses the browser **Web Audio API** and **Speech Synthesis API**; no extra frontend libraries.

### Backend (`server/`)

- **Node.js** with `"type": "module"`
- **express** – static files and `/api/describe`
- **@google/genai** – Gemini for graph descriptions
- **dotenv** – `GEMINI_API_KEY` from `server/.env`

See `server/package.json` for versions.

## Graph Mode quick start

1. Open the app (via Node server or static server) and go to **Graph Mode** (from the landing page or `graph-mode.html`).
2. Choose a function from the dropdown (e.g. **sin(x)**, **x²**).
3. Use **←** and **→** to move along the graph. Pitch reflects the y-value.
4. First key press may be needed to start audio (browser autoplay policy).
5. When the cursor crosses a critical point, you’ll hear a distinct crossing sound; minima, maxima, and inflection points are marked on the graph.

In the browser console you can toggle the critical-point detector: `criticalPoints.disable()` and `criticalPoints.enable()`.
