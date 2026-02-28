/**
 * Math engine – Math.js wrapper for parsing and evaluating expressions.
 * Uses variable name "x" for the independent variable.
 */
(function (global) {
    "use strict";

    function parse(expr) {
        try {
            return math.parse(expr);
        } catch (e) {
            return null;
        }
    }

    function evaluate(expr, x) {
        try {
            return math.evaluate(expr, { x: x });
        } catch (e) {
            return NaN;
        }
    }

    /**
     * Evaluate expression over a domain; returns { x: number[], y: number[] }.
     * Skips points where evaluation is NaN or non-finite (e.g. 1/x at 0).
     */
    function sample(expr, xMin, xMax, step) {
        step = step || 0.1;
        var x = [];
        var y = [];
        for (var xi = xMin; xi <= xMax; xi += step) {
            var yi = evaluate(expr, xi);
            if (typeof yi === "number" && isFinite(yi)) {
                x.push(xi);
                y.push(yi);
            }
        }
        return { x: x, y: y };
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.mathEngine = {
        parse: parse,
        evaluate: evaluate,
        sample: sample
    };
})(typeof window !== "undefined" ? window : this);
