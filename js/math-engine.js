/**
 * Math engine – Math.js wrapper for parsing and evaluating expressions.
 * Supports "y = ..." / "f(x) = ..." stripping, implicit multiplication,
 * parameters (a, b, ...), and LaTeX output via toTex().
 */
(function (global) {
    "use strict";

    var INDEPENDENT = "x";
    var RESERVED = { x: true, pi: true, e: true, true: true, false: true, i: true };

    /**
     * Normalize input: strip "y = ", "f(x) = ", "y=" etc. and trim.
     * Returns the expression string for the right-hand side.
     */
    function normalizeExpressionInput(str) {
        if (typeof str !== "string") return "";
        var s = str.trim().replace(/\s+/g, " ");
        s = s.replace(/\u03C0/g, "pi");
        var eq = s.indexOf("=");
        if (eq !== -1) {
            var left = s.slice(0, eq).trim().toLowerCase();
            var right = s.slice(eq + 1).trim();
            if (/^(y|f\s*\(\s*x\s*\))$/.test(left)) return right;
        }
        return s;
    }

    /**
     * Parse expression string. Accepts "y = 2x^2" or "2x^2".
     * Returns { node, expr } or null on error.
     */
    function parse(expr) {
        var normalized = normalizeExpressionInput(expr);
        if (!normalized) return null;
        try {
            var node = math.parse(normalized);
            return { node: node, expr: normalized };
        } catch (e) {
            return null;
        }
    }

    /**
     * Get LaTeX for the expression (RHS only). Returns string or empty on error.
     */
    function toTex(expr) {
        var parsed = parse(expr);
        if (!parsed || !parsed.node) return "";
        try {
            return parsed.node.toTex();
        } catch (e) {
            return "";
        }
    }

    /**
     * Extract parameter names (symbols that are not x, pi, e, etc.).
     * Returns sorted array of unique names.
     */
    function getParameterNames(expr) {
        var parsed = parse(expr);
        if (!parsed || !parsed.node) return [];
        var names = [];
        parsed.node.traverse(function (node) {
            if (node.type === "SymbolNode" && !RESERVED[node.name]) {
                if (names.indexOf(node.name) === -1) names.push(node.name);
            }
        });
        return names.sort();
    }

    /**
     * Evaluate expression at x with optional parameters. scope = { x: number, a?: number, ... }.
     */
    function evaluate(expr, x, params) {
        var normalized = normalizeExpressionInput(expr);
        if (!normalized) return NaN;
        var scope = { x: x };
        if (params && typeof params === "object") {
            for (var k in params) if (params.hasOwnProperty(k)) scope[k] = Number(params[k]);
        }
        try {
            return math.evaluate(normalized, scope);
        } catch (e) {
            return NaN;
        }
    }

    /**
     * Evaluate expression over a domain with optional parameters.
     * Returns { x: number[], y: number[] }. Skips NaN/non-finite.
     */
    function sample(expr, xMin, xMax, step, params) {
        step = step == null ? 0.1 : step;
        var x = [];
        var y = [];
        for (var xi = xMin; xi <= xMax; xi += step) {
            var yi = evaluate(expr, xi, params);
            if (typeof yi === "number" && isFinite(yi)) {
                x.push(xi);
                y.push(yi);
            }
        }
        return { x: x, y: y };
    }

    /**
     * Validate expression: returns { valid: boolean, error?: string }.
     */
    function validate(expr) {
        var normalized = normalizeExpressionInput(expr);
        if (!normalized) return { valid: false, error: "Enter an expression" };
        try {
            math.parse(normalized);
            return { valid: true };
        } catch (e) {
            var msg = (e && e.message) ? e.message : "Invalid expression";
            return { valid: false, error: msg };
        }
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.mathEngine = {
        parse: parse,
        evaluate: evaluate,
        sample: sample,
        toTex: toTex,
        getParameterNames: getParameterNames,
        normalizeExpressionInput: normalizeExpressionInput,
        validate: validate
    };
})(typeof window !== "undefined" ? window : this);
