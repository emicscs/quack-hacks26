# Audible Math

A web-based mathematical sonification engine that translates function graphs into sound. Pitch corresponds to the function’s y-value; you move along the x-axis with the arrow keys.

## Dependencies

The app is **frontend-only**. All external libraries are loaded from CDNs; there is no `package.json` or build step.

| Dependency | Version | Source | Used for |
|------------|---------|--------|----------|
| **Plotly.js** | latest | [cdn.plot.ly](https://cdn.plot.ly/plotly-latest.min.js) | Graphing functions (same style as `graph_example.html`) |
| **Math.js** | 12.0.0 | [cdnjs.cloudflare.com](https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.0.0/math.min.js) | Parsing and evaluating expressions (e.g. `sin(x)`, `x^2`, `1/x`) |

The rest is vanilla HTML, CSS, and JavaScript. The browser’s **Web Audio API** and **Speech Synthesis API** are used for sound and voice intro; no extra libraries are required.

## How to run

You need to serve the project over **HTTP** (not by opening files with `file://`), so that:

- CDN scripts load correctly
- Web Audio runs in a secure context
- CORS and mixed content don’t block resources

### Option 1: Python

From the project root:

```bash
# Python 3
python3 -m http.server 8765
```

Then open: **http://localhost:8765/index.html**

### Option 2: Node.js (npx)

```bash
npx serve -p 8765
```

Then open: **http://localhost:8765**

### Option 3: PHP

```bash
php -S localhost:8765
```

Then open: **http://localhost:8765/index.html**

---

**Landing:** Open `index.html` (or the server root) and click **Enter Graph Mode**.

**Graph Mode:** Pick a function from the dropdown, then use **←** and **→** to move along the graph. Pitch reflects the y-value; the first key press may be needed to start audio (browser policy).
