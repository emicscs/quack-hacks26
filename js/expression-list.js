/**
 * Expression list – modular state for multiple expressions.
 * No DOM; emits change events for rows and graph. Supports add, remove,
 * update (input/params/visibility), validation, and color assignment.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!mathEngine) return;

    var COLORS = [
        "#4a9eff", "#e74c3c", "#2ecc71", "#f39c12",
        "#9b59b6", "#1abc9c", "#e91e63", "#00bcd4"
    ];
    var defaultParamRange = { min: -10, max: 10, step: 0.1 };
    var items = [];
    var nextId = 1;
    var colorIndex = 0;
    var listeners = { change: [] };

    function emit(payload) {
        listeners.change.forEach(function (fn) { fn(payload); });
    }

    function nextColor() {
        var c = COLORS[colorIndex % COLORS.length];
        colorIndex += 1;
        return c;
    }

    function recomputeItem(item) {
        var input = (item.input || "").trim();
        item.error = "";
        item.expr = "";
        item.paramNames = [];
        if (!input) {
            item.error = "Enter an expression";
            emitChange();
            return;
        }
        var validation = mathEngine.validate(input);
        if (!validation.valid) {
            item.error = validation.error || "Invalid expression";
            emitChange();
            return;
        }
        item.expr = mathEngine.normalizeExpressionInput(input);
        item.paramNames = mathEngine.getParameterNames(input);
        var prevParams = item.params || {};
        item.params = {};
        item.paramNames.forEach(function (name) {
            item.params[name] = prevParams[name] != null ? prevParams[name] : 1;
        });
        emitChange();
    }

    function emitChange() {
        emit({ type: "list", items: getSnapshot() });
    }

    function getSnapshot() {
        return items.map(function (it) {
            return {
                id: it.id,
                input: it.input,
                expr: it.expr,
                params: Object.assign({}, it.params),
                paramNames: it.paramNames.slice(),
                color: it.color,
                visible: it.visible,
                error: it.error
            };
        });
    }

    function add(initialInput) {
        var item = {
            id: "expr-" + (nextId++),
            input: initialInput || "",
            expr: "",
            params: {},
            paramNames: [],
            color: nextColor(),
            visible: true,
            error: ""
        };
        items.push(item);
        recomputeItem(item);
        return item.id;
    }

    function remove(id) {
        var idx = items.findIndex(function (it) { return it.id === id; });
        if (idx === -1) return;
        items.splice(idx, 1);
        emitChange();
    }

    function get(id) {
        return items.find(function (it) { return it.id === id; });
    }

    function updateInput(id, input) {
        var item = get(id);
        if (!item || item.input === input) return;
        item.input = input;
        recomputeItem(item);
    }

    function updateParam(id, name, value) {
        var item = get(id);
        if (!item || !item.params || !item.params.hasOwnProperty(name)) return;
        var num = Number(value);
        if (item.params[name] === num) return;
        item.params[name] = num;
        emitChange();
    }

    function setVisible(id, visible) {
        var item = get(id);
        if (!item || item.visible === visible) return;
        item.visible = visible;
        emitChange();
    }

    function getVisibleExpressions() {
        return items.filter(function (it) { return it.visible && it.expr; }).map(function (it) {
            return { id: it.id, expr: it.expr, params: it.params, color: it.color };
        });
    }

    function getItemSnapshot(item) {
        return {
            id: item.id,
            input: item.input,
            expr: item.expr,
            params: Object.assign({}, item.params),
            paramNames: item.paramNames.slice(),
            color: item.color,
            visible: item.visible,
            error: item.error
        };
    }

    function getAll() {
        return getSnapshot();
    }

    function onChange(fn) {
        listeners.change.push(fn);
    }

    function offChange(fn) {
        var i = listeners.change.indexOf(fn);
        if (i !== -1) listeners.change.splice(i, 1);
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.expressionList = {
        add: add,
        remove: remove,
        get: get,
        updateInput: updateInput,
        updateParam: updateParam,
        setVisible: setVisible,
        getVisibleExpressions: getVisibleExpressions,
        getAll: getAll,
        onChange: onChange,
        offChange: offChange,
        defaultParamRange: defaultParamRange
    };
})(typeof window !== "undefined" ? window : this);
