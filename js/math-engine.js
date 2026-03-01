/**
 * Math engine – Math.js wrapper for parsing and evaluating expressions.
 * Supports "y = ..." / "f(x) = ..." stripping, implicit multiplication,
 * parameters (a, b, ...), and LaTeX output via toTex().
 */
(function (global) {
    "use strict";

    var RESERVED = { x: true, pi: true, e: true, i: true };

    function lastNonSpaceChar(str) {
        for (var i = str.length - 1; i >= 0; i--) {
            if (str[i] !== " ") return str[i];
        }
        return "";
    }

    function isAbsOpeningContext(prevCh) {
        if (!prevCh) return true;
        return /[\(\[\{,\+\-\*\/\^=<>]/.test(prevCh);
    }

    function normalizeAbsoluteBars(str) {
        var out = "";
        var absDepth = 0;
        for (var i = 0; i < str.length; i++) {
            var ch = str[i];
            if (ch !== "|") {
                out += ch;
                continue;
            }

            var prevCh = lastNonSpaceChar(out);
            if (absDepth > 0 && !isAbsOpeningContext(prevCh)) {
                out += ")";
                absDepth--;
            } else {
                out += "abs(";
                absDepth++;
            }
        }
        while (absDepth > 0) {
            out += ")";
            absDepth--;
        }
        return out;
    }

    function applyCommonInputConversions(str) {
        var s = str;
        // Common keyboard / pasted math symbols.
        s = s.replace(/\u00D7/g, "*"); // multiplication sign
        s = s.replace(/\u00F7/g, "/"); // division sign
        s = s.replace(/\u2212/g, "-"); // unicode minus
        s = s.replace(/\u03C0/g, "pi"); // pi symbol

        // sqrt shorthand: √x -> sqrt(x), √(x+1) -> sqrt(x+1)
        s = s.replace(/\u221A\s*\(([^\)]*)\)/g, "sqrt($1)");
        s = s.replace(/\u221A\s*([A-Za-z0-9_.]+)/g, "sqrt($1)");

        // Absolute value shorthand: |expr| -> abs(expr)
        s = normalizeAbsoluteBars(s);
        return s;
    }

    function normalizeExpressionInput(str) {
        if (typeof str !== "string") return "";
        var s = str.trim().replace(/\s+/g, " ");
        var eq = s.indexOf("=");
        if (eq !== -1) {
            var left = s.slice(0, eq).trim().toLowerCase();
            var right = s.slice(eq + 1).trim();
            if (/^(y|f\s*\(\s*x\s*\))$/.test(left)) s = right;
        }
        s = applyCommonInputConversions(s);
        return s;
    }

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

    function toTex(expr) {
        var parsed = parse(expr);
        if (!parsed || !parsed.node) return "";
        try {
            return parsed.node.toTex();
        } catch (e) {
            return "";
        }
    }

    function getParameterNames(expr) {
        var parsed = parse(expr);
        if (!parsed || !parsed.node) return [];
        var names = [];
        parsed.node.traverse(function (node, path, parent) {
            var isFunctionName = parent && parent.type === "FunctionNode" && parent.fn === node;
            if (node.type === "SymbolNode" && !isFunctionName && !RESERVED[node.name]) {
                if (names.indexOf(node.name) === -1) names.push(node.name);
            }
        });
        return names.sort();
    }

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

    function validate(expr) {
        var normalized = normalizeExpressionInput(expr);
        if (!normalized) return { valid: false, error: "Enter an expression" };
        try {
            math.parse(normalized);
            return { valid: true };
        } catch (e) {
            return { valid: false, error: (e && e.message) || "Invalid expression" };
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
