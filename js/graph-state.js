/**
 * Graph state – current function, domain, cursor x, and Plotly updates.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var currentExpr = "sin(x)";
    var domain = { min: -2 * Math.PI, max: 2 * Math.PI };
    var trueDomainBounds = { min: null, max: null };
    var step = 0.1;
    var cursorStep = 1;
    var repeatDelayMs = 200;
    var stopAtCriticalPoints = false;
    var currentParams = {};
    var currentX = 0;
    var dataXY = { x: [], y: [] };
    var criticalPoints = [];
    var hoverPoint = null;
    var onCursorChange = function () { };
    var onSettingsChange = function () { };
    var onViewWindowChange = function () { };

    var REPEAT_DELAY_MIN_MS = 100;
    var REPEAT_DELAY_MAX_MS = 2000;
    var REPEAT_DELAY_INCREMENT_MS = 100;
    var DELAY_HOLD_REPEAT_MS = 200;
    var navTimerId = null;
    var delayTimerId = null;
    var activeNavKey = null;
    var activeDelayKey = null;
    var blockedCuePlayedForActiveNav = false;
    var NAV_PROBE_STEPS = 8;

    var catalogDomains = {
        "sin(x)": { viewMin: -2 * Math.PI, viewMax: 2 * Math.PI, min: null, max: null },
        "x^2": { viewMin: -5, viewMax: 5, min: null, max: null },
        "1/x": { viewMin: -5, viewMax: 5, min: null, max: null },
        "x": { viewMin: -5, viewMax: 5, min: null, max: null },
        "sqrt(x)": { viewMin: 0, viewMax: 10, min: 0, max: null },
        "e^x": { viewMin: -5, viewMax: 5, min: null, max: null }
    };

    function refreshSampledData() {
        dataXY = mathEngine.sample(currentExpr, domain.min, domain.max, step, currentParams);
    }

    function domainPresetFor(expr) {
        if (catalogDomains[expr]) return catalogDomains[expr];
        if (/^sqrt\s*\(/i.test(expr)) return { viewMin: 0, viewMax: 10, min: 0, max: null };
        return { viewMin: -5, viewMax: 5, min: null, max: null };
    }

    function clampToTrueDomain(x) {
        if (typeof trueDomainBounds.min === "number" && isFinite(trueDomainBounds.min) && x < trueDomainBounds.min) return trueDomainBounds.min;
        if (typeof trueDomainBounds.max === "number" && isFinite(trueDomainBounds.max) && x > trueDomainBounds.max) return trueDomainBounds.max;
        return x;
    }

    function setFunction(expr, options) {
        options = options || {};
        currentExpr = expr;
        var preset = domainPresetFor(expr);
        trueDomainBounds.min = preset.min;
        trueDomainBounds.max = preset.max;
        if (!options.preserveView) {
            domain.min = preset.viewMin;
            domain.max = preset.viewMax;
        }
        if (!options.preserveCursor) {
            currentX = clampToTrueDomain(domain.min);
        } else {
            currentX = clampToTrueDomain(currentX);
        }
        refreshSampledData();
    }

    function setFunctionParams(params) {
        currentParams = (params && typeof params === "object") ? Object.assign({}, params) : {};
        refreshSampledData();
    }

    function getYAt(x) {
        var y = mathEngine.evaluate(currentExpr, x, currentParams);
        return typeof y === "number" && isFinite(y) ? y : NaN;
    }

    function playBlockedNavigationCue() {
        var s = global.AudibleMath && global.AudibleMath.sonification;
        if (s && typeof s.playBlockedCue === "function") s.playBlockedCue();
    }

    function notifyBlockedNavigation() {
        if (activeNavKey) {
            if (blockedCuePlayedForActiveNav) return;
            blockedCuePlayedForActiveNav = true;
        }
        playBlockedNavigationCue();
    }

    function getBoundForDirection(direction) {
        if (direction < 0 && typeof trueDomainBounds.min === "number" && isFinite(trueDomainBounds.min)) return trueDomainBounds.min;
        if (direction > 0 && typeof trueDomainBounds.max === "number" && isFinite(trueDomainBounds.max)) return trueDomainBounds.max;
        return null;
    }

    function isAtTrueEnd(direction) {
        var bound = getBoundForDirection(direction);
        if (bound === null) return false;
        var epsilon = Math.max(step * 0.25, 1e-9);
        return Math.abs(currentX - bound) <= epsilon;
    }

    function resolveNextX(delta) {
        if (!delta) return null;
        var direction = delta < 0 ? -1 : 1;
        var bound = getBoundForDirection(direction);
        var candidate = currentX + delta;
        if (bound !== null && ((direction < 0 && candidate < bound) || (direction > 0 && candidate > bound))) {
            if (currentX === bound) return null;
            candidate = bound;
        }
        if (!isNaN(getYAt(candidate))) return candidate;
        var probeStep = Math.max(Math.abs(delta) * 0.5, step);
        for (var i = 1; i <= NAV_PROBE_STEPS; i++) {
            var probeX = candidate + direction * probeStep * i;
            if (bound !== null && ((direction < 0 && probeX < bound) || (direction > 0 && probeX > bound))) break;
            if (!isNaN(getYAt(probeX))) return probeX;
        }
        return null;
    }

    function setViewWindow(minX, maxX, shouldNotify) {
        if (!(typeof minX === "number" && isFinite(minX) && typeof maxX === "number" && isFinite(maxX))) return false;
        if (!(maxX > minX)) return false;
        var width = maxX - minX;
        if (typeof trueDomainBounds.min === "number" && isFinite(trueDomainBounds.min) && minX < trueDomainBounds.min) {
            minX = trueDomainBounds.min;
            maxX = minX + width;
        }
        if (typeof trueDomainBounds.max === "number" && isFinite(trueDomainBounds.max) && maxX > trueDomainBounds.max) {
            maxX = trueDomainBounds.max;
            minX = maxX - width;
        }
        if (domain.min === minX && domain.max === maxX) return false;
        domain.min = minX;
        domain.max = maxX;
        refreshSampledData();
        if (shouldNotify !== false) onViewWindowChange(domain.min, domain.max);
        return true;
    }

    function loadChunkIfOutOfView() {
        var width = domain.max - domain.min;
        if (!(width > 0)) return false;
        var minX = domain.min;
        var maxX = domain.max;

        // Load full-width chunks only after cursor leaves current view.
        while (currentX < minX) {
            minX -= width;
            maxX -= width;
        }
        while (currentX > maxX) {
            minX += width;
            maxX += width;
        }
        return setViewWindow(minX, maxX, true);
    }

    function moveCursor(delta) {
        var direction = delta < 0 ? -1 : (delta > 0 ? 1 : 0);
        var newX = resolveNextX(delta);
        if (newX === null) {
            // Only play the blocked cue when movement is blocked by a true boundary.
            var attemptedX = currentX + delta;
            var bound = getBoundForDirection(direction);
            var hitsTrueBoundary = bound !== null && (
                Math.abs(currentX - bound) <= Math.max(step * 0.25, 1e-9) ||
                (direction < 0 && attemptedX < bound) ||
                (direction > 0 && attemptedX > bound)
            );
            if (hitsTrueBoundary && isAtTrueEnd(direction)) notifyBlockedNavigation();
            return false;
        }
        if (stopAtCriticalPoints) {
            var criticalX = findCriticalPointBetween(currentX, newX);
            if (criticalX !== null) {
                newX = criticalX;
            }
        }
        if (newX === currentX) return false;
        currentX = newX;
        blockedCuePlayedForActiveNav = false;
        loadChunkIfOutOfView();
        var y = getYAt(currentX);
        var isValid = !isNaN(y);
        updateCursorDisplay();
        updatePlotlyCursor();
        onCursorChange(currentX, isValid ? y : 0, isValid);
        return true;
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
        // Keep guides/label anchored to keyboard graph coordinate, not mouse hover.
        var x = currentX;
        var y = getYAt(currentX);
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
            var xRange = (graphDiv.layout && graphDiv.layout.xaxis && graphDiv.layout.xaxis.range && graphDiv.layout.xaxis.range.length === 2)
                ? graphDiv.layout.xaxis.range
                : [domain.min, domain.max];
            shapes.push({
                type: "line",
                x0: xRange[0],
                x1: xRange[1],
                xref: "x",
                y0: y,
                y1: y,
                yref: "y",
                line: { color: "#4a9eff", width: 1.5, dash: "dot" }
            });
        }
        var annotations = [];
        if (typeof y === "number" && isFinite(y)) {
            annotations.push({
                x: x,
                y: y,
                xref: "x",
                yref: "y",
                text: "(" + x.toFixed(2) + ", " + y.toFixed(2) + ")",
                showarrow: false,
                xanchor: "left",
                yanchor: "bottom",
                xshift: 8,
                yshift: 8,
                font: { color: "#4a9eff", size: 12 },
                bgcolor: "rgba(26,26,26,0.8)",
                bordercolor: "#4a9eff",
                borderwidth: 1
            });
        }
        Plotly.relayout(graphDiv, { shapes: shapes, annotations: annotations });
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

    function drawGraph(options) {
        options = options || {};
        if (typeof Plotly === "undefined") return;
        var graphDiv = document.getElementById("graph");
        if (!graphDiv) return;
        refreshSampledData();
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
            xaxis: { title: "x", gridcolor: "#333", zerolinecolor: "#555", showspikes: false, range: [domain.min, domain.max] },
            yaxis: { title: "y", gridcolor: "#333", zerolinecolor: "#555", showspikes: false },
            margin: { t: 40, r: 40, b: 50, l: 60 },
            showlegend: true,
            uirevision: "graph-mode"
        };
        var config = { responsive: true };

        if (options.preserveCursor === true) {
            currentX = clampToTrueDomain(currentX);
        } else {
            currentX = domain.min;
        }

        function finishDraw() {
            bindHoverTracking(graphDiv);
            hoverPoint = null;
            updatePlotlyCursor();
            updateCursorDisplay();
            var y = getYAt(currentX);
            if (options.notifyCursor !== false) {
                onCursorChange(currentX, typeof y === "number" && isFinite(y) ? y : 0, !isNaN(y) && isFinite(y));
            }
            if (typeof options.onAfterDraw === "function") {
                options.onAfterDraw();
            }
        }

        var hasExistingPlot = Array.isArray(graphDiv.data) && graphDiv.data.length > 0;
        var plotTask = hasExistingPlot
            ? Plotly.react(graphDiv, [trace], layout, config)
            : Plotly.newPlot(graphDiv, [trace], layout, config);
        if (plotTask && typeof plotTask.then === "function") {
            plotTask.then(finishDraw);
        } else {
            finishDraw();
        }
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
        setFunction(document.getElementById("function-catalog").value || "sin(x)", { preserveView: false, preserveCursor: false });
        notifySettingsChange();

        document.addEventListener("keydown", function (e) {
            if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                if (e.repeat || activeNavKey === e.key) return;
                resumeAudioIfNeeded();
                activeNavKey = e.key;
                blockedCuePlayedForActiveNav = false;
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
                blockedCuePlayedForActiveNav = false;
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
        setFunctionParams: setFunctionParams,
        moveCursor: moveCursor,
        drawGraph: drawGraph,
        updateCursorDisplay: updateCursorDisplay,
        updatePlotlyCursor: updatePlotlyCursor,
        setViewWindow: setViewWindow,
        getViewWindow: function () { return { min: domain.min, max: domain.max }; },
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
        set onSettingsChange(f) { onSettingsChange = f; },
        get onViewWindowChange() { return onViewWindowChange; },
        set onViewWindowChange(f) { onViewWindowChange = typeof f === "function" ? f : function () { }; }
    };
})(typeof window !== "undefined" ? window : this);
