/**
 * Graph renderer – Plotly-based drawing only. Updates trace data via Plotly.react
 * for expression/parameter changes; pan/zoom only change layout (no re-sample).
 * Keeps expression management separate from rendering for responsive updates.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var graphDiv = null;
    var currentDomain = { min: -5, max: 5 };
    var step = 0.05;
    var cursorX = null;
    var cursorShape = null;

    function getDefaultLayout() {
        return {
            paper_bgcolor: "#1a1a1a",
            plot_bgcolor: "#252525",
            font: { color: "#e8e8e8", size: 12 },
            xaxis: {
                title: "x",
                gridcolor: "#333",
                zerolinecolor: "#555",
                fixedrange: false
            },
            yaxis: {
                title: "y",
                gridcolor: "#333",
                zerolinecolor: "#555",
                scaleanchor: "x",
                scaleratio: 1,
                fixedrange: false
            },
            margin: { t: 40, r: 40, b: 50, l: 60 },
            showlegend: false,
            dragmode: "pan"
        };
    }

    /**
     * Update graph trace from expression and parameters. Uses Plotly.react
     * to avoid full re-initialization and keep pan/zoom state.
     */
    function updateData(expr, params, domain) {
        if (typeof Plotly === "undefined" || !graphDiv) return;
        var d = domain || currentDomain;
        currentDomain = { min: d.min, max: d.max };

        if (!expr || !expr.trim()) {
            Plotly.react(graphDiv, [{ x: [], y: [], mode: "lines", type: "scatter", name: "f(x)" }], graphDiv.layout || getDefaultLayout(), { responsive: true });
            return;
        }

        var dataXY = mathEngine.sample(expr, d.min, d.max, step, params);
        var trace = {
            x: dataXY.x,
            y: dataXY.y,
            mode: "lines",
            type: "scatter",
            name: "f(x)",
            line: { color: "#4a9eff", width: 2 }
        };

        var layout = graphDiv.layout ? Object.assign({}, graphDiv.layout) : getDefaultLayout();
        if (!graphDiv.data || graphDiv.data.length === 0) {
            Plotly.newPlot(graphDiv, [trace], layout, { responsive: true });
        } else {
            Plotly.react(graphDiv, [trace], layout, { responsive: true });
        }
        updateCursorShape();
    }

    function updateCursorShape() {
        if (typeof Plotly === "undefined" || !graphDiv || cursorX == null) return;
        var shapes = cursorX != null ? [{
            type: "line",
            x0: cursorX,
            x1: cursorX,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#4a9eff", width: 2, dash: "dot" }
        }] : [];
        Plotly.relayout(graphDiv, { shapes: shapes });
    }

    function setCursorX(x) {
        cursorX = x;
        updateCursorShape();
    }

    function getDomain() {
        return { min: currentDomain.min, max: currentDomain.max };
    }

    function setDomain(min, max) {
        currentDomain = { min: min, max: max };
    }

    /**
     * Get current axis ranges from Plotly (after user pan/zoom).
     */
    function getVisibleRange() {
        if (!graphDiv || !graphDiv.layout) return null;
        var x = graphDiv.layout.xaxis;
        var y = graphDiv.layout.yaxis;
        return {
            x: x && x.range ? { min: x.range[0], max: x.range[1] } : null,
            y: y && y.range ? { min: y.range[0], max: y.range[1] } : null
        };
    }

    function init(containerId) {
        var container = document.getElementById(containerId || "graph");
        if (!container) return;
        graphDiv = container;
        var layout = getDefaultLayout();
        Plotly.newPlot(graphDiv, [{ x: [], y: [], mode: "lines", type: "scatter", name: "f(x)" }], layout, { responsive: true });
    }

    function getElement() {
        return graphDiv;
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.graphRenderer = {
        init: init,
        updateData: updateData,
        setCursorX: setCursorX,
        getDomain: getDomain,
        setDomain: setDomain,
        getVisibleRange: getVisibleRange,
        getElement: getElement
    };
})(typeof window !== "undefined" ? window : this);
