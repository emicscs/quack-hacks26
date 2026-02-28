/**
 * Graph state – current function, domain, cursor x, and Plotly updates.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var currentExpr = "sin(x)";
    var currentParams = {};
    var domain = { min: -2 * Math.PI, max: 2 * Math.PI };
    var step = 0.1;
    var cursorStep = 0.1;
    var currentX = 0;
    var dataXY = { x: [], y: [] };
    var onCursorChange = function () {};
    var graphRenderer = null;

    var catalogDomains = {
        "sin(x)": { min: -2 * Math.PI, max: 2 * Math.PI },
        "x^2": { min: -5, max: 5 },
        "1/x": { min: -5, max: 5 },
        "x": { min: -5, max: 5 },
        "sqrt(x)": { min: 0, max: 10 }
    };

    function setFunction(expr) {
        currentExpr = expr;
        currentParams = {};
        domain = catalogDomains[expr] || { min: -5, max: 5 };
        dataXY = mathEngine.sample(currentExpr, domain.min, domain.max, step, currentParams);
        currentX = domain.min;
    }

    function setExpression(expr, params) {
        currentExpr = expr || currentExpr;
        currentParams = params && typeof params === "object" ? Object.assign({}, params) : {};
        dataXY = mathEngine.sample(currentExpr, domain.min, domain.max, step, currentParams);
        currentX = Math.max(domain.min, Math.min(domain.max, currentX));
    }

    function setDomain(min, max) {
        domain = { min: min, max: max };
        currentX = Math.max(min, Math.min(max, currentX));
    }

    function setGraphRenderer(renderer) {
        graphRenderer = renderer;
    }

    function getYAt(x) {
        var y = mathEngine.evaluate(currentExpr, x, currentParams);
        return typeof y === "number" && isFinite(y) ? y : NaN;
    }

    function moveCursor(delta) {
        var newX = currentX + delta;
        newX = Math.max(domain.min, Math.min(domain.max, newX));
        if (newX === currentX) return;
        currentX = newX;
        var y = getYAt(currentX);
        var isValid = !isNaN(y);
        updateCursorDisplay();
        updatePlotlyCursor();
        onCursorChange(currentX, isValid ? y : 0, isValid);
    }

    function updateCursorDisplay() {
        var xEl = document.getElementById("current-x");
        var yEl = document.getElementById("current-y");
        if (!xEl || !yEl) return;
        var y = getYAt(currentX);
        xEl.textContent = currentX.toFixed(2);
        yEl.textContent = (typeof y === "number" && isFinite(y)) ? y.toFixed(2) : "undefined";
    }

    function updatePlotlyCursor() {
        if (graphRenderer && graphRenderer.setCursorX) {
            graphRenderer.setCursorX(currentX);
            return;
        }
        if (typeof Plotly === "undefined") return;
        var graphDiv = document.getElementById("graph");
        if (!graphDiv || !graphDiv.data) return;
        var shapes = [{
            type: "line",
            x0: currentX,
            x1: currentX,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#4a9eff", width: 2, dash: "dot" }
        }];
        Plotly.relayout(graphDiv, { shapes: shapes });
    }

    function drawGraph() {
        if (graphRenderer && graphRenderer.updateData) {
            graphRenderer.setDomain(domain.min, domain.max);
            graphRenderer.updateData(currentExpr, currentParams, domain);
            currentX = domain.min;
            updatePlotlyCursor();
            var y = getYAt(currentX);
            onCursorChange(currentX, typeof y === "number" && isFinite(y) ? y : 0, !isNaN(y) && isFinite(y));
            return;
        }
        if (typeof Plotly === "undefined") return;
        dataXY = mathEngine.sample(currentExpr, domain.min, domain.max, step, currentParams);
        var trace = { x: dataXY.x, y: dataXY.y, mode: "lines", type: "scatter", name: "f(x)" };
        var layout = {
            paper_bgcolor: "#1a1a1a",
            plot_bgcolor: "#252525",
            font: { color: "#e8e8e8", size: 12 },
            xaxis: { title: "x", gridcolor: "#333", zerolinecolor: "#555" },
            yaxis: { title: "y", gridcolor: "#333", zerolinecolor: "#555" },
            margin: { t: 40, r: 40, b: 50, l: 60 },
            showlegend: false
        };
        var config = { responsive: true };
        Plotly.newPlot("graph", [trace], layout, config);
        currentX = domain.min;
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

    function init(useCatalog) {
        var catalog = document.getElementById("function-catalog");
        if (useCatalog !== false && catalog) {
            setFunction(catalog.value || "sin(x)");
        } else {
            setExpression("sin(x)", {});
            setDomain(-2 * Math.PI, 2 * Math.PI);
        }

        document.addEventListener("keydown", function (e) {
            if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                resumeAudioIfNeeded();
                moveCursor(-cursorStep);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                resumeAudioIfNeeded();
                moveCursor(cursorStep);
            }
        });
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.graphState = {
        setFunction: setFunction,
        setExpression: setExpression,
        setDomain: setDomain,
        setGraphRenderer: setGraphRenderer,
        moveCursor: moveCursor,
        drawGraph: drawGraph,
        updateCursorDisplay: updateCursorDisplay,
        getYAt: getYAt,
        get currentX() { return currentX; },
        get dataXY() { return dataXY; },
        get domain() { return domain; },
        getFunctionLabel: getFunctionLabel,
        getDomain: getDomain,
        init: init,
        get onCursorChange() { return onCursorChange; },
        set onCursorChange(f) { onCursorChange = f; }
    };
})(typeof window !== "undefined" ? window : this);
