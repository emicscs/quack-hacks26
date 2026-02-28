/**
 * criticalPointDetector.js
 * Standalone, self-contained module. No dependencies.
 * Detects local minima, maxima, and inflection points on a curve (x[], y[]),
 * visually marks them, and plays distinct Web Audio beeps per type.
 *
 * Drop-in: inject script, then:
 *   CriticalPointDetector.attach("#your-graph");
 * With Plotly, data is read from the first trace automatically.
 *
 * Options (all optional):
 *   getData()     – return { x: number[], y: number[] }; default: read from Plotly if present
 *   markPoints    – false to skip visual marks (default true)
 *   playTones     – false to skip beeps (default true)
 *   clearMarks    – false to keep previous marks (default true)
 *   onDetect(points) – callback with { minima, maxima, inflection }
 *   onMarkPoints(points, container) – custom drawing when not using Plotly
 *   markerSize, beepDuration, beepGap, freqMin, freqMax, freqInflection – tune appearance/sound
 */
(function (global) {
    "use strict";

    var AudioContext = global.AudioContext || global.webkitAudioContext;

    /**
     * Refine a candidate min/max at index i by fitting a parabola through
     * (x[i-1],y[i-1]), (x[i],y[i]), (x[i+1],y[i+1]) and returning the vertex.
     * Returns null if refinement is invalid (e.g. linear segment).
     */
    function refineExtremum(x, y, i, isMin) {
        var x0 = x[i - 1], x1 = x[i], x2 = x[i + 1];
        var y0 = y[i - 1], y1 = y[i], y2 = y[i + 1];
        var d0 = (y1 - y0) / (x1 - x0);
        var d1 = (y2 - y1) / (x2 - x1);
        var denom = x2 - x0;
        if (denom === 0) return null;
        var a = (d1 - d0) / denom;
        var b = d0 - a * (x1 + x0);
        if (a === 0) return null;
        if (isMin && a < 0) return null;
        if (!isMin && a > 0) return null;
        var xv = -b / (2 * a);
        xv = Math.max(x0, Math.min(x2, xv));
        var c = y0 - a * x0 * x0 - b * x0;
        var yv = a * xv * xv + b * xv + c;
        return { x: xv, y: yv };
    }

    /**
     * Refine an inflection candidate at j (second-derivative sign change).
     * Use second-difference values at j-1, j, j+1 and linear zero-crossing for x.
     */
    function refineInflection(x, y, j) {
        if (j < 2 || j >= x.length - 2) return { x: x[j], y: y[j] };
        var d2Left = y[j] - 2 * y[j - 1] + y[j - 2];
        var d2Right = y[j + 2] - 2 * y[j + 1] + y[j];
        var denom = d2Right - d2Left;
        if (denom === 0) return { x: x[j], y: y[j] };
        var xLeft = x[j - 1], xRight = x[j + 1];
        var t = -d2Left / denom;
        t = Math.max(0, Math.min(1, t));
        var xInf = xLeft + t * (xRight - xLeft);
        var yInf = y[j - 1] + (y[j + 1] - y[j - 1]) * ((xInf - x[j - 1]) / (x[j + 1] - x[j - 1] || 1));
        return { x: xInf, y: typeof yInf === "number" && isFinite(yInf) ? yInf : y[j] };
    }

    function findCriticalPoints(x, y) {
        if (!x || !y || x.length !== y.length || x.length < 3) {
            return { minima: [], maxima: [], inflection: [] };
        }
        var n = x.length;
        var minima = [];
        var maxima = [];
        var inflection = [];

        function isFiniteNum(v) {
            return typeof v === "number" && isFinite(v);
        }

        for (var i = 1; i < n - 1; i++) {
            var yi = y[i];
            var y0 = y[i - 1];
            var y1 = y[i + 1];
            if (!isFiniteNum(yi) || !isFiniteNum(y0) || !isFiniteNum(y1)) continue;

            if (yi <= y0 && yi <= y1 && (yi < y0 || yi < y1)) {
                var refined = refineExtremum(x, y, i, true);
                minima.push(refined || { x: x[i], y: yi });
            }
            if (yi >= y0 && yi >= y1 && (yi > y0 || yi > y1)) {
                var refined = refineExtremum(x, y, i, false);
                maxima.push(refined || { x: x[i], y: yi });
            }
        }

        var d2Prev = null;
        for (var j = 1; j < n - 1; j++) {
            var d2 = y[j + 1] - 2 * y[j] + y[j - 1];
            if (!isFiniteNum(d2)) continue;
            if (d2Prev !== null && d2Prev * d2 < 0) {
                var refined = refineInflection(x, y, j);
                inflection.push(refined);
            }
            d2Prev = d2;
        }

        return { minima: minima, maxima: maxima, inflection: inflection };
    }

    function playTones(points, options) {
        if (!AudioContext) return;
        options = options || {};
        var ctx = options.audioContext;
        if (!ctx) {
            ctx = new AudioContext();
            if (options) options.audioContext = ctx;
        }
        if (ctx.state === "suspended") ctx.resume();

        var duration = typeof options.beepDuration === "number" ? options.beepDuration : 0.12;
        var gap = typeof options.beepGap === "number" ? options.beepGap : 0.08;
        var freqMin = typeof options.freqMin === "number" ? options.freqMin : 280;
        var freqMax = typeof options.freqMax === "number" ? options.freqMax : 520;
        var freqInflection = typeof options.freqInflection === "number" ? options.freqInflection : 740;

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
        points.minima.forEach(function () {
            beep(freqMin, t);
            t += duration + gap;
        });
        points.maxima.forEach(function () {
            beep(freqMax, t);
            t += duration + gap;
        });
        points.inflection.forEach(function () {
            beep(freqInflection, t);
            t += duration + gap;
        });
    }

    var crossingState = {
        lastCursorX: null,
        points: null,
        audioContext: null,
        xTolerance: 0.06
    };

    function playCrossingSound(type, options) {
        if (!AudioContext) return;
        options = options || {};
        var ctx = options.audioContext || crossingState.audioContext;
        if (!ctx) {
            ctx = new AudioContext();
            crossingState.audioContext = ctx;
        }
        if (ctx.state === "suspended") ctx.resume();

        var duration = typeof options.crossingDuration === "number" ? options.crossingDuration : 0.28;
        var gain = typeof options.crossingGain === "number" ? options.crossingGain : 0.4;
        var freqMin = typeof options.freqMin === "number" ? options.freqMin : 280;
        var freqMax = typeof options.freqMax === "number" ? options.freqMax : 520;
        var freqInflection = typeof options.freqInflection === "number" ? options.freqInflection : 740;
        var freq = type === "min" ? freqMin : type === "max" ? freqMax : freqInflection;

        var when = ctx.currentTime;
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
        var tol = typeof options.xTolerance === "number" ? options.xTolerance : crossingState.xTolerance;

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
        }
        crossingState.lastCursorX = x;
    }

    function setCrossingPoints(points, initialCursorX) {
        crossingState.points = points;
        crossingState.lastCursorX = typeof initialCursorX === "number" ? initialCursorX : null;
    }

    function getDataFromPlotly(container) {
        var el = typeof container === "string" ? document.querySelector(container) : container;
        if (!el || !el.data || !el.data[0]) return null;
        var trace = el.data[0];
        var rawX = trace.x;
        var rawY = trace.y;
        if (!rawX || !rawY || rawX.length !== rawY.length) return null;
        var x = [];
        var y = [];
        for (var i = 0; i < rawX.length; i++) {
            var xi = rawX[i];
            var yi = rawY[i];
            if (typeof xi === "number" && isFinite(xi) && typeof yi === "number" && isFinite(yi)) {
                x.push(xi);
                y.push(yi);
            }
        }
        if (x.length < 3) return null;
        return { x: x, y: y };
    }

    function addPlotlyMarks(container, points, options) {
        var Plotly = global.Plotly;
        if (!Plotly) return false;
        var el = typeof container === "string" ? document.querySelector(container) : container;
        if (!el || !el.data) return false;

        var markerSize = typeof options.markerSize === "number" ? options.markerSize : 12;
        var traces = [];

        if (points.minima.length) {
            traces.push({
                x: points.minima.map(function (p) { return p.x; }),
                y: points.minima.map(function (p) { return p.y; }),
                mode: "markers",
                type: "scatter",
                marker: { size: markerSize, color: "#2ecc71", symbol: "triangle-down", line: { color: "#1a1a1a", width: 1 } },
                name: "Local min"
            });
        }
        if (points.maxima.length) {
            traces.push({
                x: points.maxima.map(function (p) { return p.x; }),
                y: points.maxima.map(function (p) { return p.y; }),
                mode: "markers",
                type: "scatter",
                marker: { size: markerSize, color: "#e74c3c", symbol: "triangle-up", line: { color: "#1a1a1a", width: 1 } },
                name: "Local max"
            });
        }
        if (points.inflection.length) {
            traces.push({
                x: points.inflection.map(function (p) { return p.x; }),
                y: points.inflection.map(function (p) { return p.y; }),
                mode: "markers",
                type: "scatter",
                marker: { size: markerSize, color: "#3498db", symbol: "diamond", line: { color: "#1a1a1a", width: 1 } },
                name: "Inflection"
            });
        }

        if (traces.length) Plotly.addTraces(el, traces);
        return true;
    }

    function removePlotlyMarks(container) {
        var Plotly = global.Plotly;
        if (!Plotly) return;
        var el = typeof container === "string" ? document.querySelector(container) : container;
        if (!el || !el.data || el.data.length <= 1) return;
        var indices = [];
        for (var i = el.data.length - 1; i >= 1; i--) {
            var name = el.data[i].name;
            if (name === "Local min" || name === "Local max" || name === "Inflection") indices.push(i);
        }
        if (indices.length) Plotly.deleteTraces(el, indices.sort(function (a, b) { return b - a; }));
    }

    function attach(containerSelectorOrElement, options) {
        options = options || {};
        var container = typeof containerSelectorOrElement === "string"
            ? document.querySelector(containerSelectorOrElement)
            : containerSelectorOrElement;
        if (!container) return null;

        var getData = options.getData;
        if (!getData && typeof Plotly !== "undefined") {
            getData = function () { return getDataFromPlotly(container); };
        }
        if (!getData) return null;

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
            if (!addPlotlyMarks(container, points, options) && options.onMarkPoints) {
                options.onMarkPoints(points, container);
            }
        }

        if (options.playTones !== false) playTones(points, options);

        if (options.onDetect) options.onDetect(points);

        var initialX = options.initialCursorX;
        if (initialX === undefined && options.getCursorX && typeof options.getCursorX === "function") {
            initialX = options.getCursorX();
        }
        setCrossingPoints(points, initialX);

        return points;
    }

    var attachDelayMs = 150;

    function integrate(options) {
        options = options || {};
        var graphSelector = options.graphSelector || options.container;
        var getCursorX = options.getCursorX;
        var onCursorChange = options.onCursorChange;
        var enabled = true;

        function run() {
            if (!enabled || !graphSelector) return;
            setTimeout(function () {
                var attachOptions = {};
                if (options.getData && typeof options.getData === "function") {
                    attachOptions.getData = options.getData;
                }
                if (getCursorX && typeof getCursorX === "function") {
                    attachOptions.getCursorX = getCursorX;
                }
                attach(graphSelector, attachOptions);
            }, attachDelayMs);
        }

        function cursorHandler(x, y, isValid) {
            if (enabled) updateCursor(x, options);
            if (onCursorChange && typeof onCursorChange === "function") {
                onCursorChange(x, y, isValid);
            }
        }

        function disable() {
            enabled = false;
            if (graphSelector) removePlotlyMarks(typeof graphSelector === "string" ? document.querySelector(graphSelector) : graphSelector);
        }

        function enable() {
            enabled = true;
            run();
        }

        return { run: run, cursorHandler: cursorHandler, enable: enable, disable: disable, get enabled() { return enabled; } };
    }

    var CriticalPointDetector = {
        findCriticalPoints: findCriticalPoints,
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
