/**
 * criticalPointDetector.js
 * Standalone module (no dependencies). Detects local minima, maxima, and
 * inflection points on (x[], y[]), marks them on Plotly, and plays Web Audio tones.
 *
 * Usage:
 *   CriticalPointDetector.attach("#graph");
 *   // or with options:
 *   CriticalPointDetector.attach("#graph", { getData: function() { return { x: [...], y: [...] }; } });
 *
 * Options: getData, markPoints, playTones, clearMarks, onDetect, onMarkPoints,
 *   markerSize, beepDuration, beepGap, freqMin, freqMax, freqInflection,
 *   initialCursorX, getCursorX, xTolerance.
 */
(function (global) {
    "use strict";

    var AudioContext = global.AudioContext || global.webkitAudioContext;

    function isFiniteNumber(v) {
        return typeof v === "number" && Number.isFinite(v);
    }

    /**
     * Build clean { x, y } arrays from raw trace arrays, dropping non-finite and nulls.
     */
    function toFinitePairs(rawX, rawY) {
        if (!Array.isArray(rawX) || !Array.isArray(rawY) || rawX.length !== rawY.length) {
            return null;
        }
        var x = [];
        var y = [];
        for (var i = 0; i < rawX.length; i++) {
            var xi = rawX[i];
            var yi = rawY[i];
            if (xi != null && yi != null && isFiniteNumber(xi) && isFiniteNumber(yi)) {
                x.push(xi);
                y.push(yi);
            }
        }
        return x.length >= 3 ? { x: x, y: y } : null;
    }

    /**
     * Refine a local min/max at index i using a parabola through (i-1, i, i+1).
     * Returns vertex { x, y } or null if invalid. Uses correct 2ax+b = slope form.
     */
    function refineExtremum(x, y, i, isMin) {
        var x0 = x[i - 1], x1 = x[i], x2 = x[i + 1];
        var y0 = y[i - 1], y1 = y[i], y2 = y[i + 1];
        var d0 = (y1 - y0) / (x1 - x0);
        var d1 = (y2 - y1) / (x2 - x1);
        var denom = 2 * (x1 - x0);
        if (denom === 0 || !Number.isFinite(d0) || !Number.isFinite(d1)) return null;
        var a = (d1 - d0) / denom;
        if (a === 0) return null;
        if (isMin && a <= 0) return null;
        if (!isMin && a >= 0) return null;
        var b = d0 - 2 * a * x0;
        var xv = -b / (2 * a);
        xv = Math.max(x0, Math.min(x2, xv));
        var c = y0 - a * x0 * x0 - b * x0;
        var yv = a * xv * xv + b * xv + c;
        if (!isFiniteNumber(xv) || !isFiniteNumber(yv)) return null;
        return { x: xv, y: yv };
    }

    /**
     * Refine inflection at j where second-difference changes sign (linear zero-crossing).
     */
    function refineInflection(x, y, j) {
        if (j < 2 || j >= x.length - 2) return { x: x[j], y: y[j] };
        var d2L = y[j] - 2 * y[j - 1] + y[j - 2];
        var d2R = y[j + 2] - 2 * y[j + 1] + y[j];
        var denom = d2R - d2L;
        if (denom === 0 || !Number.isFinite(d2L) || !Number.isFinite(d2R)) {
            return { x: x[j], y: y[j] };
        }
        var t = -d2L / denom;
        t = Math.max(0, Math.min(1, t));
        var xL = x[j - 1], xR = x[j + 1];
        var xInf = xL + t * (xR - xL);
        var dx = xR - xL || 1;
        var yInf = y[j - 1] + (y[j + 1] - y[j - 1]) * ((xInf - xL) / dx);
        return { x: xInf, y: isFiniteNumber(yInf) ? yInf : y[j] };
    }

    /**
     * Find critical points from sampled curve (x[], y[]). Returns
     * { minima: [{x,y}, ...], maxima: [...], inflection: [...] }.
     */
    function findCriticalPoints(x, y) {
        var out = { minima: [], maxima: [], inflection: [] };
        var data = toFinitePairs(x, y);
        if (!data) return out;
        x = data.x;
        y = data.y;
        var n = x.length;
        if (n < 3) return out;

        for (var i = 1; i < n - 1; i++) {
            var yi = y[i], yL = y[i - 1], yR = y[i + 1];
            if (!isFiniteNumber(yi) || !isFiniteNumber(yL) || !isFiniteNumber(yR)) continue;

            if (yi <= yL && yi <= yR && (yi < yL || yi < yR)) {
                var refined = refineExtremum(x, y, i, true);
                out.minima.push(refined || { x: x[i], y: yi });
            }
            if (yi >= yL && yi >= yR && (yi > yL || yi > yR)) {
                var refined = refineExtremum(x, y, i, false);
                out.maxima.push(refined || { x: x[i], y: yi });
            }
        }

        var d2Prev = null;
        var yRange = n >= 2 ? Math.abs((Math.max.apply(null, y) - Math.min.apply(null, y))) || 1 : 1;
        var d2Tolerance = 1e-10 * (yRange + 1);
        for (var j = 1; j < n - 1; j++) {
            var d2 = y[j + 1] - 2 * y[j] + y[j - 1];
            if (!isFiniteNumber(d2)) continue;
            if (d2Prev !== null && d2Prev * d2 < 0 && Math.abs(d2Prev) > d2Tolerance && Math.abs(d2) > d2Tolerance) {
                out.inflection.push(refineInflection(x, y, j));
            }
            d2Prev = d2;
        }
        return out;
    }

    function playTones(points, options) {
        if (!AudioContext) return;
        options = options || {};
        var ctx = options.audioContext;
        if (!ctx) {
            ctx = new AudioContext();
            options.audioContext = ctx;
        }
        if (ctx.state === "suspended") ctx.resume();

        var duration = Number.isFinite(options.beepDuration) ? options.beepDuration : 0.12;
        var gap = Number.isFinite(options.beepGap) ? options.beepGap : 0.08;
        var freqMin = Number.isFinite(options.freqMin) ? options.freqMin : 280;
        var freqMax = Number.isFinite(options.freqMax) ? options.freqMax : 520;
        var freqInf = Number.isFinite(options.freqInflection) ? options.freqInflection : 740;

        function beep(freq, when) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, when);
            gain.gain.setValueAtTime(0.15, when);
            gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
            osc.start(when);
            osc.stop(when + duration);
        }

        var t = ctx.currentTime;
        points.minima.forEach(function () { beep(freqMin, t); t += duration + gap; });
        points.maxima.forEach(function () { beep(freqMax, t); t += duration + gap; });
        points.inflection.forEach(function () { beep(freqInf, t); t += duration + gap; });
    }

    var crossingState = { lastCursorX: null, points: null, audioContext: null, xTolerance: 0.06 };

    function playCrossingSound(type, options) {
        if (!AudioContext) return;
        options = options || {};
        var ctx = options.audioContext || crossingState.audioContext;
        if (!ctx) {
            ctx = new AudioContext();
            crossingState.audioContext = ctx;
        }
        if (ctx.state === "suspended") ctx.resume();

        var duration = Number.isFinite(options.crossingDuration) ? options.crossingDuration : 0.28;
        var gain = Number.isFinite(options.crossingGain) ? options.crossingGain : 0.4;
        var freqMin = Number.isFinite(options.freqMin) ? options.freqMin : 280;
        var freqMax = Number.isFinite(options.freqMax) ? options.freqMax : 520;
        var freqInf = Number.isFinite(options.freqInflection) ? options.freqInflection : 740;
        var freqIx = Number.isFinite(options.freqIntersection) ? options.freqIntersection : 880;
        var when = ctx.currentTime;

        if (type === "intersection") {
            var snareDur = 0.2;
            var bufLen = Math.ceil(ctx.sampleRate * snareDur);
            var noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
            var nd = noiseBuf.getChannelData(0);
            for (var s = 0; s < bufLen; s++) nd[s] = Math.random() * 2 - 1;
            var noise = ctx.createBufferSource();
            noise.buffer = noiseBuf;
            var hpf = ctx.createBiquadFilter();
            hpf.type = "highpass";
            hpf.frequency.value = 2000;
            var lpf = ctx.createBiquadFilter();
            lpf.type = "lowpass";
            lpf.frequency.value = 9000;
            var nGain = ctx.createGain();
            nGain.gain.setValueAtTime(0.9, when);
            nGain.gain.exponentialRampToValueAtTime(0.001, when + snareDur);
            noise.connect(hpf);
            hpf.connect(lpf);
            lpf.connect(nGain);
            nGain.connect(ctx.destination);
            var body = ctx.createOscillator();
            body.type = "triangle";
            body.frequency.setValueAtTime(180, when);
            body.frequency.exponentialRampToValueAtTime(80, when + snareDur * 0.3);
            var bGain = ctx.createGain();
            bGain.gain.setValueAtTime(0.8, when);
            bGain.gain.exponentialRampToValueAtTime(0.001, when + snareDur * 0.25);
            body.connect(bGain);
            bGain.connect(ctx.destination);
            noise.start(when);
            noise.stop(when + snareDur);
            body.start(when);
            body.stop(when + snareDur);
            return;
        }

        var freq = type === "min" ? freqMin : type === "max" ? freqMax : freqInf;

        var osc = ctx.createOscillator();
        var osc2 = ctx.createOscillator();
        var g = ctx.createGain();
        osc.connect(g);
        osc2.connect(g);
        g.connect(ctx.destination);
        osc.type = "square";
        osc2.type = "sine";
        osc.frequency.setValueAtTime(freq, when);
        osc2.frequency.setValueAtTime(freq * 1.2, when);
        g.gain.setValueAtTime(gain, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + duration);
        osc.start(when);
        osc2.start(when);
        osc.stop(when + duration);
        osc2.stop(when + duration);
    }

    function crossed(prev, curr, pointX, tol) {
        if (prev === null) return false;
        return (prev < pointX - tol && curr >= pointX - tol) || (prev > pointX + tol && curr <= pointX + tol);
    }

    function updateCursor(x, options) {
        options = options || {};
        var pts = crossingState.points;
        if (!pts) return;
        var prev = crossingState.lastCursorX;
        var tol = Number.isFinite(options.xTolerance) ? options.xTolerance : crossingState.xTolerance;
        if (prev !== null) {
            pts.minima.forEach(function (p) {
                if (crossed(prev, x, p.x, tol)) playCrossingSound("min", options);
            });
            pts.maxima.forEach(function (p) {
                if (crossed(prev, x, p.x, tol)) playCrossingSound("max", options);
            });
            pts.inflection.forEach(function (p) {
                if (crossed(prev, x, p.x, tol)) playCrossingSound("inflection", options);
            });
            if (pts.intersections) {
                pts.intersections.forEach(function (p) {
                    if (crossed(prev, x, p.x, tol)) playCrossingSound("intersection", options);
                });
            }
        }
        crossingState.lastCursorX = x;
    }

    function setCrossingPoints(points, initialCursorX) {
        var prevIx = crossingState.points && crossingState.points.intersections;
        crossingState.points = points;
        if (prevIx && !points.intersections) points.intersections = prevIx;
        crossingState.lastCursorX = isFiniteNumber(initialCursorX) ? initialCursorX : null;
    }

    function setIntersectionPoints(intersections) {
        if (!crossingState.points) crossingState.points = { minima: [], maxima: [], inflection: [] };
        crossingState.points.intersections = Array.isArray(intersections) ? intersections : [];
    }

    /**
     * Read first trace's x,y from a Plotly graph div. Plotly attaches .data to the div.
     */
    function getDataFromPlotly(container) {
        var el = typeof container === "string" ? document.querySelector(container) : container;
        if (!el || !el.data || !Array.isArray(el.data) || el.data.length === 0) return null;
        var trace = el.data[0];
        var rawX = trace && trace.x;
        var rawY = trace && trace.y;
        return toFinitePairs(rawX, rawY);
    }

    function addPlotlyMarks(container, points, options) {
        var Plotly = global.Plotly;
        if (!Plotly) return false;
        var el = typeof container === "string" ? document.querySelector(container) : container;
        if (!el || !Array.isArray(el.data)) return false;

        var size = Number.isFinite(options.markerSize) ? options.markerSize : 12;
        var traces = [];

        if (points.minima.length) {
            traces.push({
                x: points.minima.map(function (p) { return p.x; }),
                y: points.minima.map(function (p) { return p.y; }),
                mode: "markers",
                type: "scatter",
                marker: { size: size, color: "#2ecc71", symbol: "triangle-down", line: { color: "#1a1a1a", width: 1 } },
                name: "Local min"
            });
        }
        if (points.maxima.length) {
            traces.push({
                x: points.maxima.map(function (p) { return p.x; }),
                y: points.maxima.map(function (p) { return p.y; }),
                mode: "markers",
                type: "scatter",
                marker: { size: size, color: "#e74c3c", symbol: "triangle-up", line: { color: "#1a1a1a", width: 1 } },
                name: "Local max"
            });
        }
        if (points.inflection.length) {
            traces.push({
                x: points.inflection.map(function (p) { return p.x; }),
                y: points.inflection.map(function (p) { return p.y; }),
                mode: "markers",
                type: "scatter",
                marker: { size: size, color: "#3498db", symbol: "diamond", line: { color: "#1a1a1a", width: 1 } },
                name: "Inflection"
            });
        }
        if (traces.length) Plotly.addTraces(el, traces);
        return traces.length > 0;
    }

    function removePlotlyMarks(container) {
        var Plotly = global.Plotly;
        if (!Plotly) return;
        var el = typeof container === "string" ? document.querySelector(container) : container;
        if (!el || !Array.isArray(el.data) || el.data.length <= 1) return;
        var indices = [];
        for (var i = el.data.length - 1; i >= 1; i--) {
            var name = el.data[i].name;
            if (name === "Local min" || name === "Local max" || name === "Inflection") indices.push(i);
        }
        indices.sort(function (a, b) { return b - a; });
        if (indices.length) Plotly.deleteTraces(el, indices);
    }

    function attach(containerSelectorOrElement, options) {
        options = options || {};
        var container = typeof containerSelectorOrElement === "string"
            ? document.querySelector(containerSelectorOrElement)
            : containerSelectorOrElement;
        if (!container) return null;

        var getData = options.getData;
        if (!getData && typeof global.Plotly !== "undefined") {
            getData = function () { return getDataFromPlotly(container); };
        }
        if (typeof getData !== "function") return null;

        var data = getData();
        if (!data || !data.x || !data.y) return null;

        if (options.clearMarks !== false) removePlotlyMarks(container);

        var points;
        if (data.criticalPoints &&
            Array.isArray(data.criticalPoints.minima) &&
            Array.isArray(data.criticalPoints.maxima) &&
            Array.isArray(data.criticalPoints.inflection)) {
            points = data.criticalPoints;
        } else {
            points = findCriticalPoints(data.x, data.y);
        }

        if (options.markPoints !== false) {
            if (!addPlotlyMarks(container, points, options) && typeof options.onMarkPoints === "function") {
                options.onMarkPoints(points, container);
            }
        }

        if (options.playTones !== false) playTones(points, options);
        if (typeof options.onDetect === "function") options.onDetect(points);

        var initialX = options.initialCursorX;
        if (initialX === undefined && typeof options.getCursorX === "function") {
            initialX = options.getCursorX();
        }
        setCrossingPoints(points, initialX);

        return points;
    }

    var attachDelayMs = 0;

    function integrate(options) {
        options = options || {};
        var graphSelector = options.graphSelector || options.container;
        var getCursorX = options.getCursorX;
        var onCursorChange = options.onCursorChange;
        var enabled = true;

        function run(runtimeOpts) {
            if (!enabled || !graphSelector) return;
            var runAttach = function () {
                var attachOptions = {};
                if (typeof options.getData === "function") attachOptions.getData = options.getData;
                if (typeof getCursorX === "function") attachOptions.getCursorX = getCursorX;
                if (runtimeOpts && runtimeOpts.playTones === false) attachOptions.playTones = false;
                attach(graphSelector, attachOptions);
            };
            if (attachDelayMs > 0) setTimeout(runAttach, attachDelayMs);
            else if (typeof requestAnimationFrame === "function") requestAnimationFrame(runAttach);
            else setTimeout(runAttach, 0);
        }

        function cursorHandler(x, y, isValid) {
            if (enabled) updateCursor(x, options);
            if (typeof onCursorChange === "function") onCursorChange(x, y, isValid);
        }

        function disable() {
            enabled = false;
            if (graphSelector) {
                var el = typeof graphSelector === "string" ? document.querySelector(graphSelector) : graphSelector;
                if (el) removePlotlyMarks(el);
            }
        }

        function enable() {
            enabled = true;
            run();
        }

        return {
            run: run,
            cursorHandler: cursorHandler,
            enable: enable,
            disable: disable,
            get enabled() { return enabled; }
        };
    }

    /**
     * Find intersection points between two functions using sampling + bisection.
     * evalA(x) and evalB(x) return y-values. Returns [{x, y}, ...].
     */
    function findIntersections(evalA, evalB, xMin, xMax, step) {
        step = step || 0.05;
        var points = [];
        var prevDiff = null;
        var prevX = null;
        for (var x = xMin; x <= xMax; x += step) {
            var ya = evalA(x);
            var yb = evalB(x);
            if (!isFiniteNumber(ya) || !isFiniteNumber(yb)) {
                prevDiff = null;
                prevX = null;
                continue;
            }
            var diff = ya - yb;
            if (prevDiff !== null && prevDiff * diff < 0) {
                var lo = prevX, hi = x;
                for (var k = 0; k < 30; k++) {
                    var mid = (lo + hi) / 2;
                    var dMid = evalA(mid) - evalB(mid);
                    if (!isFiniteNumber(dMid)) break;
                    if ((evalA(lo) - evalB(lo)) * dMid < 0) hi = mid;
                    else lo = mid;
                }
                var xi = (lo + hi) / 2;
                var yi = (evalA(xi) + evalB(xi)) / 2;
                if (isFiniteNumber(xi) && isFiniteNumber(yi)) {
                    points.push({ x: xi, y: yi });
                }
            } else if (prevDiff !== null && Math.abs(diff) < 1e-10 && isFiniteNumber(ya)) {
                if (points.length === 0 || Math.abs(points[points.length - 1].x - x) > step * 0.5) {
                    points.push({ x: x, y: ya });
                }
            }
            prevDiff = diff;
            prevX = x;
        }
        return points;
    }

    var CriticalPointDetector = {
        findCriticalPoints: findCriticalPoints,
        findIntersections: findIntersections,
        setIntersectionPoints: setIntersectionPoints,
        playTones: playTones,
        attach: attach,
        integrate: integrate,
        updateCursor: updateCursor,
        setCrossingPoints: setCrossingPoints,
        playCrossingSound: playCrossingSound,
        getDataFromPlotly: getDataFromPlotly,
        addPlotlyMarks: addPlotlyMarks,
        removePlotlyMarks: removePlotlyMarks
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = CriticalPointDetector;
    } else {
        global.CriticalPointDetector = CriticalPointDetector;
    }
})(typeof window !== "undefined" ? window : globalThis);
