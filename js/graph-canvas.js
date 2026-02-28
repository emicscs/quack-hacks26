/**
 * Graph canvas – multi-trace Plotly graph with pan, scroll-zoom, fit, axis lock.
 * Updates only trace data on expression change; pan/zoom are layout-only for 60fps.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var graphDiv = null;
    var domain = { min: -10, max: 10 };
    var step = 0.03;
    var axisLock = false;
    var defaultLayout = null;
    var cursorX = null;

    function getDefaultLayout() {
        return {
            paper_bgcolor: "#1a1a1a",
            plot_bgcolor: "#252525",
            font: { color: "#e8e8e8", size: 12 },
            xaxis: {
                title: "x",
                gridcolor: "#333",
                zerolinecolor: "#555",
                fixedrange: false,
                scaleanchor: null,
                scaleratio: null
            },
            yaxis: {
                title: "y",
                gridcolor: "#333",
                zerolinecolor: "#555",
                fixedrange: false,
                scaleanchor: null,
                scaleratio: null
            },
            margin: { t: 24, r: 24, b: 40, l: 48 },
            showlegend: false,
            dragmode: "pan"
        };
    }

    function applyAxisLock(layout) {
        if (!axisLock) {
            if (layout.xaxis) {
                layout.xaxis.scaleanchor = null;
                layout.xaxis.scaleratio = null;
            }
            if (layout.yaxis) {
                layout.yaxis.scaleanchor = null;
                layout.yaxis.scaleratio = null;
            }
            return layout;
        }
        layout.xaxis = layout.xaxis || {};
        layout.yaxis = layout.yaxis || {};
        layout.yaxis.scaleanchor = "x";
        layout.yaxis.scaleratio = 1;
        return layout;
    }

    function sampleTrace(expr, params) {
        return mathEngine.sample(expr, domain.min, domain.max, step, params);
    }

    function setExpressions(expressionItems) {
        if (typeof Plotly === "undefined" || !graphDiv) return;
        var traces = [];
        expressionItems.forEach(function (item) {
            if (!item.expr) return;
            var dataXY = sampleTrace(item.expr, item.params || {});
            traces.push({
                x: dataXY.x,
                y: dataXY.y,
                mode: "lines",
                type: "scatter",
                line: { color: item.color || "#4a9eff", width: 2 }
            });
        });
        if (traces.length === 0) {
            traces = [{ x: [], y: [], mode: "lines", type: "scatter" }];
        }
        var layout = graphDiv.layout ? Object.assign({}, graphDiv.layout) : getDefaultLayout();
        applyAxisLock(layout);
        if (!graphDiv.data || graphDiv.data.length === 0) {
            Plotly.newPlot(graphDiv, traces, layout, { responsive: true, scrollZoom: true });
        } else {
            Plotly.react(graphDiv, traces, layout, { responsive: true, scrollZoom: true });
        }
        updateCursorShape();
    }

    function updateCursorShape() {
        if (typeof Plotly === "undefined" || !graphDiv) return;
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

    function setDomain(min, max) {
        domain = { min: min, max: max };
    }

    function getDomain() {
        return { min: domain.min, max: domain.max };
    }

    function fitView() {
        if (typeof Plotly === "undefined" || !graphDiv) return;
        var layout = Object.assign({}, graphDiv.layout || getDefaultLayout());
        layout.xaxis = layout.xaxis || {};
        layout.yaxis = layout.yaxis || {};
        layout.xaxis.autorange = true;
        layout.yaxis.autorange = true;
        applyAxisLock(layout);
        Plotly.relayout(graphDiv, layout);
    }

    function setAxisLock(lock) {
        axisLock = !!lock;
        if (!graphDiv || !graphDiv.layout) return;
        var layout = Object.assign({}, graphDiv.layout);
        applyAxisLock(layout);
        Plotly.relayout(graphDiv, layout);
    }

    function getAxisLock() {
        return axisLock;
    }

    function init(containerId) {
        var container = document.getElementById(containerId || "desmos-graph");
        if (!container) return;
        graphDiv = container;
        defaultLayout = getDefaultLayout();
        Plotly.newPlot(
            graphDiv,
            [{ x: [], y: [], mode: "lines", type: "scatter" }],
            defaultLayout,
            { responsive: true, scrollZoom: true }
        );
    }

    function getElement() {
        return graphDiv;
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.graphCanvas = {
        init: init,
        setExpressions: setExpressions,
        setCursorX: setCursorX,
        setDomain: setDomain,
        getDomain: getDomain,
        fitView: fitView,
        setAxisLock: setAxisLock,
        getAxisLock: getAxisLock,
        getElement: getElement
    };
})(typeof window !== "undefined" ? window : this);
