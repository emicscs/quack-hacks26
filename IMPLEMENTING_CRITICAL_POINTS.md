# How to implement the critical point detector

This guide explains how to add the critical point detector to a page that already has a Plotly graph (or another graph that exposes x/y data). The detector marks local minima, maxima, and inflection points and plays a sound when the cursor crosses them.

---

## Prerequisites

- A page with a graph (e.g. a `<div id="graph">` that Plotly draws into).
- The graph’s first trace must have `x` and `y` arrays (or you supply them via `getData`).
- For **cursor crossing** sounds, you need a “cursor” x-position that updates (e.g. from arrow keys) and a way to run a callback on each move.

---

## Option A: Full integration (this app’s Graph Mode)

Use this when you have **graph state** (cursor x, redraw on function change) and **sonification** that must keep running.

### Step 1: Add the script

In your HTML, after Plotly and your app scripts, add:

```html
<script src="criticalPointDetector.js"></script>
```

### Step 2: Create the integrator

In the same script block where you have `graphState` and `sonification`, create the integrator:

```javascript
const criticalPoints = window.CriticalPointDetector && CriticalPointDetector.integrate({
    graphSelector: "#graph",
    getCursorX: function () { return graphState.currentX; },
    onCursorChange: function (x, y, isValid) { sonification.setFrequencyFromY(y, isValid); }
});
if (criticalPoints) window.criticalPoints = criticalPoints;
```

- **graphSelector** – CSS selector for the graph container (or pass the DOM element).
- **getCursorX** – function that returns the current cursor x (used when the graph redraws so crossing detection starts from the right place).
- **onCursorChange** – your existing “cursor moved” logic (e.g. update pitch). The detector will call this after doing its own crossing check.

Exposing `criticalPoints` on `window` is optional; it lets you run `criticalPoints.disable()` / `criticalPoints.enable()` from the browser console.

### Step 3: Wire the cursor handler

Set the graph’s cursor callback to the integrator’s handler (so every cursor move goes through the detector, then your logic):

```javascript
graphState.onCursorChange = criticalPoints ? criticalPoints.cursorHandler : function (x, y, isValid) {
    sonification.setFrequencyFromY(y, isValid);
};
```

If the detector isn’t loaded, this falls back to only your sonification.

### Step 4: Run detection on every graph redraw

Whenever the graph is redrawn (e.g. user changes the function), run the detector again so marks and crossing state match the new curve:

```javascript
function onFunctionChange() {
    // ... set function, draw graph, update display ...
    if (criticalPoints) criticalPoints.run();
    // ... voice intro, etc. ...
}
```

That’s it. The detector will:

- Mark minima (green ▼), maxima (red ▲), and inflection (blue ◆).
- Play the short intro beeps when the graph is drawn.
- Play a loud sound when the cursor **crosses** a critical point.

---

## Option B: Minimal (any Plotly page, no cursor)

Use this when you only want **marks and intro beeps** on an existing Plotly graph, with no cursor or crossing sounds.

### Step 1: Add the script

```html
<script src="criticalPointDetector.js"></script>
```

### Step 2: Run after the graph is drawn

After `Plotly.newPlot(...)` (or when the plot is ready), call:

```javascript
CriticalPointDetector.attach("#graph");
```

Use the same selector as your graph container. The detector reads the first trace’s `x` and `y`, finds critical points, adds the marker traces, and plays the intro beeps. No `integrate()` or cursor wiring needed.

To run again after the user changes the graph (e.g. new data), call `CriticalPointDetector.attach("#graph")` again; it will clear previous marks and re-detect.

---

## Option C: Custom data source (no Plotly, or different trace)

If your data doesn’t come from the first Plotly trace, or you’re not using Plotly:

```javascript
CriticalPointDetector.attach("#container", {
    getData: function () {
        return { x: myXArray, y: myYArray };
    },
    markPoints: true,
    playTones: true
});
```

If you don’t use Plotly, the detector won’t add marks automatically; pass `onMarkPoints: function (points, container) { ... }` and draw the marks yourself (e.g. overlay SVG).

---

## Turning it off

### Unimplement completely

1. Remove `<script src="criticalPointDetector.js"></script>`.
2. Remove the `CriticalPointDetector.integrate({ ... })` block and the `criticalPoints` variable.
3. Set `graphState.onCursorChange` to only your callback (e.g. sonification).
4. Remove all `criticalPoints.run()` calls.

### Toggle at runtime (script stays)

- **Off:** `criticalPoints.disable()` – removes marks and crossing sounds; your pitch sonification keeps running.
- **On:** `criticalPoints.enable()` – re-runs detection and restores marks and crossing sounds.

In Graph Mode, `criticalPoints` is on `window`, so in the console:

```text
criticalPoints.disable()
criticalPoints.enable()
```

---

## File you need

- **criticalPointDetector.js** – single file, no dependencies. Place it where your HTML can load it (e.g. project root or a `js/` folder and use `js/criticalPointDetector.js` in the script tag).

Reference implementation: **graph-mode.html** in this repo.
