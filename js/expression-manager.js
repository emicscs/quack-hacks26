/**
 * Expression manager – holds current expression, parameters, and validation.
 * Emits change events for the entry bar and graph; no DOM or graph logic here.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var currentInput = "";
    var currentExpr = "";
    var valid = false;
    var errorMessage = "";
    var parameters = {};      // { a: 1, b: 2, ... }
    var parameterNames = [];  // ["a", "b"]
    var defaultParamRange = { min: -10, max: 10, step: 0.1 };

    var listeners = { change: [], paramsChange: [] };

    function emit(eventName, payload) {
        var list = listeners[eventName];
        if (!list) return;
        list.forEach(function (fn) { fn(payload); });
    }

    function recomputeFromInput() {
        var input = (currentInput || "").trim();
        if (!input) {
            valid = false;
            errorMessage = "Enter an expression (e.g. y = 2x^2 + 3)";
            currentExpr = "";
            parameterNames = [];
            parameters = {};
            emit("change", { valid: valid, error: errorMessage, expr: "", params: {} });
            emit("paramsChange", { names: [], params: {} });
            return;
        }

        var validation = mathEngine.validate(input);
        if (!validation.valid) {
            valid = false;
            errorMessage = validation.error || "Invalid expression";
            currentExpr = "";
            parameterNames = [];
            parameters = {};
            emit("change", { valid: valid, error: errorMessage, expr: "", params: {} });
            emit("paramsChange", { names: [], params: {} });
            return;
        }

        var normalized = mathEngine.normalizeExpressionInput(input);
        var names = mathEngine.getParameterNames(input);
        var prevNames = parameterNames.slice();
        parameterNames = names;

        // Preserve existing parameter values; init new ones to 1 (or 0 for additive)
        var newParams = {};
        names.forEach(function (name) {
            if (parameters.hasOwnProperty(name)) {
                newParams[name] = parameters[name];
            } else {
                newParams[name] = 1;
            }
        });
        parameters = newParams;
        currentExpr = normalized;
        valid = true;
        errorMessage = "";

        emit("change", { valid: valid, error: "", expr: currentExpr, params: parameters });
        if (names.join() !== prevNames.join()) {
            emit("paramsChange", { names: parameterNames, params: parameters });
        }
    }

    function setInput(input) {
        if (input === currentInput) return;
        currentInput = input;
        recomputeFromInput();
    }

    function setParameter(name, value) {
        var num = Number(value);
        if (!parameters.hasOwnProperty(name)) return;
        if (parameters[name] === num) return;
        parameters[name] = num;
        emit("change", { valid: valid, error: errorMessage, expr: currentExpr, params: parameters });
    }

    function setParameters(obj) {
        var changed = false;
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && parameters.hasOwnProperty(key)) {
                var num = Number(obj[key]);
                if (parameters[key] !== num) {
                    parameters[key] = num;
                    changed = true;
                }
            }
        }
        if (changed) {
            emit("change", { valid: valid, error: errorMessage, expr: currentExpr, params: parameters });
        }
    }

    function getInput() { return currentInput; }
    function getExpression() { return currentExpr; }
    function isValid() { return valid; }
    function getError() { return errorMessage; }
    function getParameters() { return Object.assign({}, parameters); }
    function getParameterNames() { return parameterNames.slice(); }

    function on(eventName, callback) {
        if (!listeners[eventName]) listeners[eventName] = [];
        listeners[eventName].push(callback);
    }

    function off(eventName, callback) {
        var list = listeners[eventName];
        if (!list) return;
        var i = list.indexOf(callback);
        if (i !== -1) list.splice(i, 1);
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.expressionManager = {
        setInput: setInput,
        setParameter: setParameter,
        setParameters: setParameters,
        getInput: getInput,
        getExpression: getExpression,
        isValid: isValid,
        getError: getError,
        getParameters: getParameters,
        getParameterNames: getParameterNames,
        on: on,
        off: off,
        defaultParamRange: defaultParamRange
    };
})(typeof window !== "undefined" ? window : this);
