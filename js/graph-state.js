/**
 * Graph state – current function, domain, cursor x, and Plotly updates.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var currentExpr = "sin(x)";
    var domain = { min: -2 * Math.PI, max: 2 * Math.PI };
    var step = 0.1;
    var cursorStep = 1;
    var repeatDelayMs = 200;
    var stopAtCriticalPoints = false;
    var currentX = 0;
    var dataXY = { x: [], y: [] };
    var criticalPoints = [];
    var hoverPoint = null;
    var onCursorChange = function () { };
    var onSettingsChange = function () { };

    var REPEAT_DELAY_MIN_MS = 100;
    var REPEAT_DELAY_MAX_MS = 2000;
    var REPEAT_DELAY_INCREMENT_MS = 100;
    var DELAY_HOLD_REPEAT_MS = 200;
    var navTimerId = null;
    var delayTimerId = null;
    var activeNavKey = null;
    var activeDelayKey = null;

    var catalogDomains = {
        "sin(x)": { min: -2 * Math.PI, max: 2 * Math.PI },
        "x^2": { min: -5, max: 5 },
        "1/x": { min: -5, max: 5 },
        "x": { min: -5, max: 5 },
        "sqrt(x)": { min: 0, max: 10 }
    };

    function setFunction(expr) {
        currentExpr = expr;
        domain = catalogDomains[expr] || { min: -5, max: 5 };
        dataXY = mathEngine.sample(currentExpr, domain.min, domain.max, step);
        currentX = domain.min;
    }

    function getYAt(x) {
        var y = mathEngine.evaluate(currentExpr, x);
        return typeof y === "number" && isFinite(y) ? y : NaN;
    }

    function moveCursor(delta) {
        var newX = currentX + delta;
        newX = Math.max(domain.min, Math.min(domain.max, newX));
        if (newX === currentX) return;
        if (stopAtCriticalPoints) {
            var criticalX = findCriticalPointBetween(currentX, newX);
            if (criticalX !== null) {
                newX = criticalX;
            }
        }
        currentX = newX;
        var y = getYAt(currentX);
        var isValid = !isNaN(y);
        updateCursorDisplay();
        updatePlotlyCursor();
        onCursorChange(currentX, isValid ? y : 0, isValid);
    }

    function findCriticalPointBetween(fromX, toX) {
        if (fromX === toX) return null;
        var minX = Math.min(fromX, toX);
        var maxX = Math.max(fromX, toX);

        // Fast path: many discontinuities occur at x = 0 (e.g., 1/x).
        if (0 > minX && 0 < maxX) {
            var yAtZero = getYAt(0);
            if (isNaN(yAtZero)) return 0;
        }

        // Sample interior points so large cursor steps do not jump over undefined points.
        var span = Math.abs(toX - fromX);
        var sampleCount = Math.max(12, Math.min(240, Math.ceil(span / 0.05)));
        for (var i = 1; i < sampleCount; i++) {
            var t = i / sampleCount;
            var x = fromX + (toX - fromX) * t;
            var y = getYAt(x);
            if (isNaN(y)) return x;
        }
        var turningX = findTurningPointBetween(fromX, toX);
        if (turningX !== null) return turningX;
        return null;
    }

    function derivativeAt(x) {
        var h = 1e-4;
        var yL = getYAt(x - h);
        var yR = getYAt(x + h);
        if (isNaN(yL) || isNaN(yR)) return NaN;
        return (yR - yL) / (2 * h);
    }

    function derivative2At(x) {
        var h = 1e-4;
        var dL = derivativeAt(x - h);
        var dR = derivativeAt(x + h);
        if (isNaN(dL) || isNaN(dR)) return NaN;
        return (dR - dL) / (2 * h);
    }

    function hasSignFlip(a, b) {
        return (a > 0 && b < 0) || (a < 0 && b > 0);
    }

    function refineTurningPoint(leftX, rightX, leftD, rightD) {
        var midX = (leftX + rightX) / 2;
        for (var i = 0; i < 20; i++) {
            midX = (leftX + rightX) / 2;
            var midD = derivativeAt(midX);
            if (isNaN(midD)) break;
            if (Math.abs(midD) < 1e-4) return midX;
            if (hasSignFlip(leftD, midD)) {
                rightX = midX;
                rightD = midD;
            } else {
                leftX = midX;
                leftD = midD;
            }
        }
        return midX;
    }

    function refineInflectionPoint(leftX, rightX, leftD2, rightD2) {
        for (var iter = 0; iter < 20; iter++) {
            var midX = (leftX + rightX) / 2;
            var midD2 = derivative2At(midX);
            if (isNaN(midD2)) break;
            if (Math.abs(midD2) < 1e-6) return midX;
            if (hasSignFlip(leftD2, midD2)) {
                rightX = midX;
                rightD2 = midD2;
            } else {
                leftX = midX;
                leftD2 = midD2;
            }
        }
        return (leftX + rightX) / 2;
    }

    function findTurningPointBetween(fromX, toX) {
        var span = Math.abs(toX - fromX);
        var sampleCount = Math.max(16, Math.min(320, Math.ceil(span / 0.05)));
        var slopeEps = 1e-3;
        var prevX = fromX;
        var prevD = derivativeAt(prevX);

        for (var i = 1; i < sampleCount; i++) {
            var t = i / sampleCount;
            var x = fromX + (toX - fromX) * t;
            var d = derivativeAt(x);
            if (!isNaN(d) && Math.abs(d) < slopeEps) return x;
            if (!isNaN(prevD) && !isNaN(d) && hasSignFlip(prevD, d)) {
                return refineTurningPoint(prevX, x, prevD, d);
            }
            prevX = x;
            prevD = d;
        }
        return null;
    }

    function clearNavTimer() {
        if (navTimerId) {
            clearInterval(navTimerId);
            navTimerId = null;
        }
    }

    function clearDelayTimer() {
        if (delayTimerId) {
            clearInterval(delayTimerId);
            delayTimerId = null;
        }
    }

    function notifySettingsChange() {
        onSettingsChange(cursorStep, repeatDelayMs, stopAtCriticalPoints);
    }

    function clampRepeatDelayMs(value) {
        var clamped = Math.round(value);
        clamped = Math.max(REPEAT_DELAY_MIN_MS, Math.min(REPEAT_DELAY_MAX_MS, clamped));
        return clamped;
    }

    function setCursorStep(value) {
        var num = parseFloat(value);
        if (!(typeof num === "number" && isFinite(num)) || num <= 0) return false;
        cursorStep = num;
        notifySettingsChange();
        return true;
    }

    function setRepeatDelayMs(value) {
        var num = parseFloat(value);
        if (!(typeof num === "number" && isFinite(num))) return false;
        var newDelay = clampRepeatDelayMs(num);
        if (newDelay === repeatDelayMs) return true;
        repeatDelayMs = newDelay;
        if (activeNavKey) {
            startNavRepeat(activeNavKey);
        }
        notifySettingsChange();
        return true;
    }

    function adjustRepeatDelayMs(deltaMs) {
        return setRepeatDelayMs(repeatDelayMs + deltaMs);
    }

    function getCursorStep() {
        return cursorStep;
    }

    function getRepeatDelayMs() {
        return repeatDelayMs;
    }

    function setStopAtCriticalPoints(value) {
        stopAtCriticalPoints = !!value;
        notifySettingsChange();
        return true;
    }

    function getStopAtCriticalPoints() {
        return stopAtCriticalPoints;
    }

    function navDeltaForKey(key) {
        if (key === "ArrowLeft") return -cursorStep;
        if (key === "ArrowRight") return cursorStep;
        return 0;
    }

    function delayDeltaForKey(key) {
        if (key === "ArrowUp") return REPEAT_DELAY_INCREMENT_MS;
        if (key === "ArrowDown") return -REPEAT_DELAY_INCREMENT_MS;
        return 0;
    }

    function startNavRepeat(key) {
        clearNavTimer();
        navTimerId = setInterval(function () {
            var delta = navDeltaForKey(key);
            if (delta !== 0) {
                moveCursor(delta);
            }
        }, repeatDelayMs);
    }

    function updateCursorDisplay() {
        var xEl = document.getElementById("current-x");
        var yEl = document.getElementById("current-y");
        if (!xEl || !yEl) return;
        // Keep the displayed current coordinate tied to keyboard navigation state.
        var x = currentX;
        var y = getYAt(currentX);
        xEl.textContent = x.toFixed(2);
        yEl.textContent = (typeof y === "number" && isFinite(y)) ? y.toFixed(2) : "undefined";
    }

    function updatePlotlyCursor() {
        if (typeof Plotly === "undefined") return;
        var graphDiv = document.getElementById("graph");
        if (!graphDiv || !graphDiv.data) return;
        // Hover moves the x guide line again.
        var x = hoverPoint ? hoverPoint.x : currentX;
        var y = hoverPoint ? hoverPoint.y : getYAt(currentX);
        var shapes = [{
            type: "line",
            x0: x,
            x1: x,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#4a9eff", width: 2, dash: "dot" }
        }];
        if (typeof y === "number" && isFinite(y)) {
            shapes.push({
                type: "line",
                x0: domain.min,
                x1: domain.max,
                xref: "x",
                y0: y,
                y1: y,
                yref: "y",
                line: { color: "#4a9eff", width: 1.5, dash: "dot" }
            });
        }
        Plotly.relayout(graphDiv, { shapes: shapes });
    }

    function bindHoverTracking(graphDiv) {
        if (!graphDiv || typeof graphDiv.on !== "function") return;
        if (typeof graphDiv.removeAllListeners === "function") {
            graphDiv.removeAllListeners("plotly_hover");
            graphDiv.removeAllListeners("plotly_unhover");
        }
        graphDiv.on("plotly_hover", function (eventData) {
            if (!eventData || !eventData.points || !eventData.points.length) return;
            var point = eventData.points[0];
            if (typeof point.x !== "number" || typeof point.y !== "number") return;
            hoverPoint = { x: point.x, y: point.y };
            updateCursorDisplay();
            updatePlotlyCursor();
        });
        graphDiv.on("plotly_unhover", function () {
            hoverPoint = null;
            updateCursorDisplay();
            updatePlotlyCursor();
        });
    }

    function addCriticalPoint(list, x, y, type) {
        if (!(typeof x === "number" && isFinite(x) && typeof y === "number" && isFinite(y))) return;
        for (var i = 0; i < list.length; i++) {
            if (Math.abs(list[i].x - x) < 0.05) return;
        }
        list.push({ x: x, y: y, type: type });
    }

    function calculateCriticalPoints() {
        var points = [];
        var xs = dataXY.x;
        var ys = dataXY.y;
        if (!xs || xs.length < 3) return points;

        var slopeEps = 1e-6;
        for (var i = 1; i < ys.length - 1; i++) {
            var dyPrev = ys[i] - ys[i - 1];
            var dyNext = ys[i + 1] - ys[i];
            var prevSign = dyPrev > slopeEps ? 1 : (dyPrev < -slopeEps ? -1 : 0);
            var nextSign = dyNext > slopeEps ? 1 : (dyNext < -slopeEps ? -1 : 0);
            if (prevSign > 0 && nextSign < 0) {
                var leftX = xs[i - 1], rightX = xs[i + 1];
                var leftD = derivativeAt(leftX), rightD = derivativeAt(rightX);
                var xRefined = refineTurningPoint(leftX, rightX, leftD, rightD);
                var x = (typeof xRefined === "number" && isFinite(xRefined)) ? xRefined : xs[i];
                var y = getYAt(x);
                addCriticalPoint(points, x, typeof y === "number" && isFinite(y) ? y : ys[i], "max");
            } else if (prevSign < 0 && nextSign > 0) {
                var leftX = xs[i - 1], rightX = xs[i + 1];
                var leftD = derivativeAt(leftX), rightD = derivativeAt(rightX);
                var xRefined = refineTurningPoint(leftX, rightX, leftD, rightD);
                var x = (typeof xRefined === "number" && isFinite(xRefined)) ? xRefined : xs[i];
                var y = getYAt(x);
                addCriticalPoint(points, x, typeof y === "number" && isFinite(y) ? y : ys[i], "min");
            }
        }

        // Inflection points: f''(x) = 0, using the equation via derivative2At.
        // Ignore sign flips when both |d2| values are below tolerance (avoids false inflections on linear).
        var yRange = 1;
        if (ys.length) {
            var yMin = ys[0], yMax = ys[0];
            for (var r = 1; r < ys.length; r++) {
                if (typeof ys[r] === "number" && isFinite(ys[r])) {
                    if (ys[r] < yMin) yMin = ys[r];
                    if (ys[r] > yMax) yMax = ys[r];
                }
            }
            yRange = Math.abs(yMax - yMin) || 1;
        }
        var d2Tolerance = 1e-6 * (yRange + 1);
        var d2Prev = null;
        var xPrev = null;
        for (var k = 0; k < xs.length; k++) {
            var xk = xs[k];
            var d2 = derivative2At(xk);
            if (typeof d2 !== "number" || !isFinite(d2)) continue;
            if (d2Prev !== null && xPrev !== null && hasSignFlip(d2Prev, d2) &&
                Math.abs(d2Prev) > d2Tolerance && Math.abs(d2) > d2Tolerance) {
                var xRefined = refineInflectionPoint(xPrev, xk, d2Prev, d2);
                var yRefined = getYAt(xRefined);
                if (typeof yRefined === "number" && isFinite(yRefined)) {
                    addCriticalPoint(points, xRefined, yRefined, "inflection");
                }
            }
            d2Prev = d2;
            xPrev = xk;
        }

        // Detect sampled gaps that indicate a discontinuity between finite segments.
        for (var j = 0; j < xs.length - 1; j++) {
            var gap = Math.abs(xs[j + 1] - xs[j]);
            if (gap > step * 1.5) {
                addCriticalPoint(points, xs[j], ys[j], "edge");
                addCriticalPoint(points, xs[j + 1], ys[j + 1], "edge");
            }
        }

        return points;
    }

    function getCriticalPoints() {
        var minList = [], maxList = [], infList = [];
        for (var i = 0; i < criticalPoints.length; i++) {
            var p = criticalPoints[i];
            var pt = { x: p.x, y: p.y };
            if (p.type === "min") minList.push(pt);
            else if (p.type === "max") maxList.push(pt);
            else if (p.type === "inflection") infList.push(pt);
        }
        return { minima: minList, maxima: maxList, inflection: infList };
    }

    function criticalTypeLabel(type) {
        if (type === "max") return "local max";
        if (type === "min") return "local min";
        if (type === "inflection") return "inflection";
        if (type === "edge") return "discontinuity edge";
        return "critical point";
    }

    function buildLineWithBreaks() {
        var lineX = [];
        var lineY = [];
        var xs = dataXY.x;
        var ys = dataXY.y;
        var criticalSnapEps = Math.max(step * 0.6, 0.06);
        for (var i = 0; i < xs.length; i++) {
            var isNearCritical = false;
            for (var c = 0; c < criticalPoints.length; c++) {
                if (Math.abs(xs[i] - criticalPoints[c].x) <= criticalSnapEps) {
                    isNearCritical = true;
                    break;
                }
            }
            if (isNearCritical) {
                // Hide line hover at critical locations so only critical marker label appears.
                continue;
            }
            if (i > 0) {
                var gap = Math.abs(xs[i] - xs[i - 1]);
                if (gap > step * 1.5) {
                    // Null separators tell Plotly to break the line at discontinuities.
                    lineX.push(null);
                    lineY.push(null);
                }
            }
            lineX.push(xs[i]);
            lineY.push(ys[i]);
        }
        return { x: lineX, y: lineY };
    }

    function drawGraph() {
        if (typeof Plotly === "undefined") return;
        dataXY = mathEngine.sample(currentExpr, domain.min, domain.max, step);
        criticalPoints = calculateCriticalPoints();
        var segmentedLine = buildLineWithBreaks();
        var trace = {
            x: segmentedLine.x,
            y: segmentedLine.y,
            mode: "lines",
            type: "scatter",
            name: "f(x)",
            connectgaps: false,
            hovertemplate: "(%{x:.2f}, %{y:.2f})<extra></extra>"
        };
        var layout = {
            paper_bgcolor: "#1a1a1a",
            plot_bgcolor: "#252525",
            font: { color: "#e8e8e8", size: 12 },
            hovermode: "closest",
            xaxis: { title: "x", gridcolor: "#333", zerolinecolor: "#555", showspikes: false },
            yaxis: { title: "y", gridcolor: "#333", zerolinecolor: "#555", showspikes: false },
            margin: { t: 40, r: 40, b: 50, l: 60 },
            showlegend: true
        };
        var config = { responsive: true };
        Plotly.newPlot("graph", [trace], layout, config);
        var graphDiv = document.getElementById("graph");
        bindHoverTracking(graphDiv);
        currentX = domain.min;
        hoverPoint = null;
        updatePlotlyCursor();
        var y = getYAt(currentX);
        onCursorChange(currentX, typeof y === "number" && isFinite(y) ? y : 0, !isNaN(y) && isFinite(y));
    }

    function getFunctionLabel() {
        var labels = {
            "sin(x)": "sine of x",
            "x^2": "x squared",
            "1/x": "1 over x",
            "x": "x",
            "sqrt(x)": "square root of x"
        };
        return labels[currentExpr] || currentExpr;
    }

    function getDomain() {
        return { min: domain.min, max: domain.max };
    }

    function resumeAudioIfNeeded() {
        var s = global.AudibleMath && global.AudibleMath.sonification;
        if (s && s.getAudioContext) {
            var ctx = s.getAudioContext();
            if (ctx && ctx.state === "suspended") ctx.resume();
        }
    }

    function init() {
        setFunction(document.getElementById("function-catalog").value || "sin(x)");
        notifySettingsChange();

        document.addEventListener("keydown", function (e) {
            if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                if (e.repeat || activeNavKey === e.key) return;
                resumeAudioIfNeeded();
                activeNavKey = e.key;
                moveCursor(navDeltaForKey(e.key));
                startNavRepeat(e.key);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                if (e.repeat || activeDelayKey === e.key) return;
                activeDelayKey = e.key;
                adjustRepeatDelayMs(delayDeltaForKey(e.key));
                clearDelayTimer();
                delayTimerId = setInterval(function () {
                    adjustRepeatDelayMs(delayDeltaForKey(activeDelayKey));
                }, DELAY_HOLD_REPEAT_MS);
            }
        });

        document.addEventListener("keyup", function (e) {
            if (e.key === activeNavKey) {
                activeNavKey = null;
                clearNavTimer();
            }
            if (e.key === activeDelayKey) {
                activeDelayKey = null;
                clearDelayTimer();
            }
        });
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.graphState = {
        setFunction: setFunction,
        moveCursor: moveCursor,
        drawGraph: drawGraph,
        updateCursorDisplay: updateCursorDisplay,
        getYAt: getYAt,
        setCursorStep: setCursorStep,
        getCursorStep: getCursorStep,
        setRepeatDelayMs: setRepeatDelayMs,
        getRepeatDelayMs: getRepeatDelayMs,
        setStopAtCriticalPoints: setStopAtCriticalPoints,
        getStopAtCriticalPoints: getStopAtCriticalPoints,
        get currentX() { return currentX; },
        get dataXY() { return dataXY; },
        get domain() { return domain; },
        getCriticalPoints: getCriticalPoints,
        getFunctionLabel: getFunctionLabel,
        getDomain: getDomain,
        init: init,
        get onCursorChange() { return onCursorChange; },
        set onCursorChange(f) { onCursorChange = f; },
        get onSettingsChange() { return onSettingsChange; },
        set onSettingsChange(f) { onSettingsChange = f; }
    };
})(typeof window !== "undefined" ? window : this);
