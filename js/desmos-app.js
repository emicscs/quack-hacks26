/**
 * Desmos-style app – wires expression list, rows, and graph canvas.
 * Modular: expression state, parsing, slider state, and rendering are separate.
 */
(function (global) {
    "use strict";

    var expressionList = global.AudibleMath && global.AudibleMath.expressionList;
    var expressionRow = global.AudibleMath && global.AudibleMath.expressionRow;
    var graphCanvas = global.AudibleMath && global.AudibleMath.graphCanvas;
    if (!expressionList || !expressionRow || !graphCanvas) return;

    var listContainer = null;
    var rowRefs = [];

    function syncGraph() {
        var visible = expressionList.getVisibleExpressions();
        graphCanvas.setExpressions(visible);
    }

    function onListChange(payload) {
        if (payload.type !== "list" || !payload.items) return;
        var items = payload.items;
        var ids = items.map(function (i) { return i.id; });

        rowRefs.forEach(function (ref) {
            var item = items.find(function (i) { return i.id === ref.id; });
            if (item) ref.updateFromItem(item);
        });

        items.forEach(function (item) {
            if (!rowRefs.some(function (r) { return r.id === item.id; })) {
                var ref = expressionRow.attachRow(item, listContainer);
                rowRefs.push({ id: item.id, updateFromItem: ref.updateFromItem });
            }
        });

        rowRefs.filter(function (r) { return ids.indexOf(r.id) === -1; }).forEach(function (r) {
            var el = listContainer.querySelector("[data-id=\"" + r.id + "\"]");
            if (el) el.remove();
        });
        rowRefs = rowRefs.filter(function (r) { return ids.indexOf(r.id) !== -1; });

        syncGraph();
    }

    function renderAllRows() {
        if (!listContainer) return;
        listContainer.innerHTML = "";
        rowRefs = [];
        expressionList.getAll().forEach(function (item) {
            var ref = expressionRow.attachRow(item, listContainer);
            rowRefs.push({ id: item.id, updateFromItem: ref.updateFromItem });
        });
    }

    function addRow() {
        var id = expressionList.add("y = x");
        var item = expressionList.get(id);
        if (item && listContainer) {
            var ref = expressionRow.attachRow(item, listContainer);
            rowRefs.push({ id: id, updateFromItem: ref.updateFromItem });
        }
        syncGraph();
    }

    function init() {
        listContainer = document.getElementById("desmos-expression-list");
        var addBtn = document.getElementById("desmos-add-row");
        var zoomFitBtn = document.getElementById("desmos-zoom-fit");
        var axisLockBtn = document.getElementById("desmos-axis-lock");

        graphCanvas.init("desmos-graph");
        graphCanvas.setDomain(-10, 10);

        expressionList.onChange(onListChange);

        if (expressionList.getAll().length === 0) {
            expressionList.add("y = sin(x)");
        }
        renderAllRows();
        syncGraph();

        if (addBtn) addBtn.addEventListener("click", addRow);
        if (zoomFitBtn) zoomFitBtn.addEventListener("click", function () { graphCanvas.fitView(); });
        if (axisLockBtn) {
            axisLockBtn.addEventListener("click", function () {
                var next = !graphCanvas.getAxisLock();
                graphCanvas.setAxisLock(next);
                axisLockBtn.classList.toggle("desmos-toolbar-btn--active", next);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(typeof window !== "undefined" ? window : this);
