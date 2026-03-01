/**
 * Math engine – Math.js wrapper for parsing and evaluating expressions.
 * Supports "y = ..." / "f(x) = ..." stripping, implicit multiplication,
 * parameters (a, b, ...), and LaTeX output via toTex().
 */
(function (global) {
    "use strict";

    var RESERVED = { x: true, pi: true, e: true, i: true };

    function prevNonSpaceChar(s, index) {
        for (var i = index - 1; i >= 0; i--) {
            if (s[i] !== " ") return s[i];
        }
        return "";
    }

    function nextNonSpaceChar(s, index) {
        for (var i = index + 1; i < s.length; i++) {
            if (s[i] !== " ") return s[i];
        }
        return "";
    }

    function isWordOrDigit(ch) {
        return !!ch && /[A-Za-z0-9_]/.test(ch);
    }

    function isValueLike(ch) {
        return !!ch && (isWordOrDigit(ch) || ch === "." || ch === ")" || ch === "]" || ch === "}");
    }

    function isValueStartLike(ch) {
        return !!ch && (isWordOrDigit(ch) || ch === "." || ch === "(" || ch === "[" || ch === "{");
    }

    function isOpenContext(ch) {
        return !ch || /[+\-*/%^=,(\[{:]/.test(ch);
    }

    function isCloseContext(ch) {
        return !ch || /[+\-*/%^=,)\]}:]/.test(ch);
    }

    function convertAbsoluteBars(expr) {
        var frames = [[]];
        for (var i = 0; i < expr.length; i++) {
            var ch = expr[i];
            if (ch !== "|") {
                frames[frames.length - 1].push(ch);
                continue;
            }

            var prev = prevNonSpaceChar(expr, i);
            var next = nextNonSpaceChar(expr, i);
            var isOpening = false;

            if (isOpenContext(prev)) {
                isOpening = true;
            } else if (frames.length === 1) {
                // At top-level, a bar after a value can still start an abs term (e.g. 2|x|).
                isOpening = true;
            } else if (isCloseContext(next)) {
                isOpening = false;
            } else if (isValueLike(prev) && isValueStartLike(next)) {
                // Inside an abs group, value|value is most often closing then implicit multiply.
                isOpening = false;
            } else {
                isOpening = false;
            }

            if (isOpening) {
                frames.push([]);
            } else {
                if (frames.length === 1) {
                    return { text: "", error: "Unmatched | in expression" };
                }
                var inner = frames.pop().join("");
                frames[frames.length - 1].push("abs(" + inner + ")");
            }
        }

        if (frames.length !== 1) {
            return { text: "", error: "Unmatched | in expression" };
        }
        return { text: frames[0].join(""), error: "" };
    }

    function applyShorthandNormalization(expr) {
        var s = expr.replace(/\bln\s*\(/gi, "log(");
        return convertAbsoluteBars(s);
    }

    function normalizeExpressionDetailed(str) {
        if (typeof str !== "string") return { text: "", error: "" };
        var s = str.trim().replace(/\s+/g, " ");
        s = s.replace(/\u03C0/g, "pi");
        var eq = s.indexOf("=");
        if (eq !== -1) {
            var left = s.slice(0, eq).trim().toLowerCase();
            var right = s.slice(eq + 1).trim();
            if (/^(y|f\s*\(\s*x\s*\))$/.test(left)) s = right;
        }
        return applyShorthandNormalization(s);
    }

    function normalizeExpressionInput(str) {
        return normalizeExpressionDetailed(str).text;
    }

    function parse(expr) {
        var normalized = normalizeExpressionDetailed(expr);
        if (normalized.error || !normalized.text) return null;
        try {
            var node = math.parse(normalized.text);
            return { node: node, expr: normalized.text };
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
        parsed.node.traverse(function (node) {
            if (node.type === "SymbolNode" && !RESERVED[node.name]) {
                if (names.indexOf(node.name) === -1) names.push(node.name);
            }
        });
        return names.sort();
    }

    function evaluate(expr, x, params) {
        var normalized = normalizeExpressionDetailed(expr);
        if (normalized.error || !normalized.text) return NaN;
        var scope = { x: x };
        if (params && typeof params === "object") {
            for (var k in params) if (params.hasOwnProperty(k)) scope[k] = Number(params[k]);
        }
        try {
            return math.evaluate(normalized.text, scope);
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
        var normalized = normalizeExpressionDetailed(expr);
        if (!normalized.text) {
            if (normalized.error) return { valid: false, error: normalized.error };
            return { valid: false, error: "Enter an expression" };
        }
        if (normalized.error) return { valid: false, error: normalized.error };
        try {
            math.parse(normalized.text);
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
