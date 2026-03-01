# Directory of sounds

This folder documents every sound the user hears in Graph Mode when critical points are detected, and (optionally) holds custom sound files you can use instead of the built-in synthesized tones.

---

## When you hear sounds

1. **Intro beeps** – When the graph is drawn or updated, one short beep plays for each critical point type (min, then max, then inflection), in order.
2. **Crossing sounds** – When you move the cursor (← / →) across a critical point, a louder “crossing” sound plays for that point type.

---

## Sound catalog

| Sound | When it plays | Default (built-in) | Optional file |
|-------|----------------|--------------------|---------------|
| **Local min (intro)** | Short beep when graph loads, one per local minimum | 280 Hz sine, ~0.12 s | `intro-min.mp3` or `.wav` |
| **Local max (intro)** | Short beep when graph loads, one per local maximum | 520 Hz sine, ~0.12 s | `intro-max.mp3` or `.wav` |
| **Inflection (intro)** | Short beep when graph loads, one per inflection point | 740 Hz sine, ~0.12 s | `intro-inflection.mp3` or `.wav` |
| **Local min (crossing)** | When cursor crosses a local minimum | 280 Hz square+sine, ~0.28 s | `crossing-min.mp3` or `.wav` |
| **Local max (crossing)** | When cursor crosses a local maximum | 520 Hz square+sine, ~0.28 s | `crossing-max.mp3` or `.wav` |
| **Inflection (crossing)** | When cursor crosses an inflection point | 740 Hz square+sine, ~0.28 s | `crossing-inflection.mp3` or `.wav` |

---

## Using custom sound files

Place your own audio files in this `sounds/` folder using the names above (e.g. `crossing-min.wav`, `intro-max.mp3`). Then pass a **sound directory** option when integrating the critical point detector so it loads and plays these files instead of the built-in beeps.

In your integration code (e.g. in `graph-mode.html`):

```javascript
CriticalPointDetector.integrate({
    graphSelector: "#graph",
    getCursorX: function () { return graphState.currentX; },
    onCursorChange: function (x, y, isValid) { sonification.setFrequencyFromY(y, isValid); },
    soundDirectory: "sounds"   // base path to this folder (optional)
});
```

Or pass explicit URLs:

```javascript
soundUrls: {
    "intro-min": "sounds/intro-min.mp3",
    "intro-max": "sounds/intro-max.mp3",
    "intro-inflection": "sounds/intro-inflection.mp3",
    "crossing-min": "sounds/crossing-min.mp3",
    "crossing-max": "sounds/crossing-max.mp3",
    "crossing-inflection": "sounds/crossing-inflection.mp3"
}
```

If a file is missing or fails to load, the detector falls back to the built-in synthesized tone for that event.
