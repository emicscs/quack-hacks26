/**
 * Expression row – single formula row UI: input, LaTeX preview, color,
 * visibility toggle, delete, sliders. Non-blocking validation with inline error.
 */
(function (global) {
    "use strict";

    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    var expressionList = global.AudibleMath && global.AudibleMath.expressionList;
    if (!mathEngine || !expressionList) return;

    var DEBOUNCE_MS = 100;
    var debounceTimers = {};

    function renderLatex(expr, intoEl) {
        if (!intoEl) return;
        var latex = mathEngine.toTex(expr);
        if (typeof katex !== "undefined") {
            try {
                intoEl.innerHTML = katex.renderToString(latex || "\\ ", { throwOnError: false, displayMode: false });
                intoEl.classList.remove("desmos-row__preview--empty", "desmos-row__preview--error");
            } catch (e) {
                intoEl.textContent = latex || "";
                intoEl.classList.add("desmos-row__preview--error");
            }
        } else {
            intoEl.textContent = latex || "";
        }
    }

    function buildRow(item, listContainer) {
        var row = document.createElement("div");
        row.className = "desmos-row" + (item.error ? " desmos-row--error" : "");
        row.dataset.id = item.id;

        row.innerHTML =
            "<div class=\"desmos-row__header\">" +
            "  <span class=\"desmos-row__color\" style=\"background:" + (item.color || "#4a9eff") + "\"></span>" +
            "  <div class=\"desmos-row__input-wrap\">" +
            "    <input type=\"text\" class=\"desmos-row__input\" placeholder=\"y = 2x^2 + 3\" value=\"" + (item.input || "").replace(/"/g, "&quot;") + "\" autocomplete=\"off\" spellcheck=\"false\" />" +
            "  </div>" +
            "  <div class=\"desmos-row__actions\">" +
            "    <button type=\"button\" class=\"desmos-row__btn desmos-row__btn--visibility\" aria-label=\"Toggle visibility\" title=\"Show/hide on graph\">\u25CF</button>" +
            "    <button type=\"button\" class=\"desmos-row__btn desmos-row__btn--delete\" aria-label=\"Remove\">\u00D7</button>" +
            "  </div>" +
            "</div>" +
            "<div class=\"desmos-row__preview desmos-row__preview--empty\"></div>" +
            "<div class=\"desmos-row__error\" style=\"display:none;\"></div>" +
            "<div class=\"desmos-row__sliders\"></div>";

        var inputEl = row.querySelector(".desmos-row__input");
        var previewEl = row.querySelector(".desmos-row__preview");
        var errorEl = row.querySelector(".desmos-row__error");
        var slidersEl = row.querySelector(".desmos-row__sliders");
        var visibilityBtn = row.querySelector(".desmos-row__btn--visibility");
        var deleteBtn = row.querySelector(".desmos-row__btn--delete");
        var colorDot = row.querySelector(".desmos-row__color");

        function flushInput() {
            var val = inputEl.value.trim();
            expressionList.updateInput(item.id, val);
        }

        function scheduleInput() {
            var id = item.id;
            if (debounceTimers[id]) clearTimeout(debounceTimers[id]);
            debounceTimers[id] = setTimeout(function () {
                debounceTimers[id] = null;
                flushInput();
            }, DEBOUNCE_MS);
        }

        inputEl.addEventListener("input", function () {
            renderLatex(this.value, previewEl);
            row.classList.remove("desmos-row--error");
            errorEl.style.display = "none";
            scheduleInput();
        });
        inputEl.addEventListener("blur", flushInput);
        inputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { flushInput(); inputEl.blur(); }
        });

        visibilityBtn.addEventListener("click", function () {
            expressionList.setVisible(item.id, !item.visible);
        });
        visibilityBtn.textContent = item.visible ? "\u25CF" : "\u25CB";
        if (!item.visible) visibilityBtn.classList.add("desmos-row__btn--eye-off");

        deleteBtn.addEventListener("click", function () {
            expressionList.remove(item.id);
            row.remove();
        });

        function updateFromItem(it) {
            if (it.id !== item.id) return;
            colorDot.style.background = it.color;
            visibilityBtn.textContent = it.visible ? "\u25CF" : "\u25CB";
            visibilityBtn.classList.toggle("desmos-row__btn--eye-off", !it.visible);
            row.classList.toggle("desmos-row--error", !!it.error);
            if (it.error) {
                errorEl.textContent = it.error;
                errorEl.style.display = "block";
            } else {
                errorEl.style.display = "none";
            }
            renderLatex(it.input, previewEl);
            if (it.paramNames && it.paramNames.length) {
                slidersEl.innerHTML = "";
                var range = expressionList.defaultParamRange;
                it.paramNames.forEach(function (name) {
                    var wrap = document.createElement("div");
                    wrap.className = "desmos-row__slider-wrap";
                    var label = document.createElement("label");
                    label.textContent = name + ":";
                    var slider = document.createElement("input");
                    slider.type = "range";
                    slider.className = "desmos-row__slider";
                    slider.min = range.min;
                    slider.max = range.max;
                    slider.step = range.step;
                    slider.value = (it.params && it.params[name]) != null ? it.params[name] : 1;
                    var valueSpan = document.createElement("span");
                    valueSpan.className = "desmos-row__slider-value";
                    valueSpan.textContent = slider.value;
                    slider.addEventListener("input", function () {
                        var v = parseFloat(this.value);
                        valueSpan.textContent = Number.isInteger(v) ? v : v.toFixed(2);
                        expressionList.updateParam(it.id, name, v);
                    });
                    wrap.appendChild(label);
                    wrap.appendChild(slider);
                    wrap.appendChild(valueSpan);
                    slidersEl.appendChild(wrap);
                });
            } else {
                slidersEl.innerHTML = "";
            }
        }

        updateFromItem(item);
        return { row: row, updateFromItem: updateFromItem };
    }

    function attachRow(item, listContainer) {
        var ref = buildRow(item, listContainer);
        listContainer.appendChild(ref.row);
        return ref;
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.expressionRow = {
        buildRow: buildRow,
        attachRow: attachRow,
        renderLatex: renderLatex
    };
})(typeof window !== "undefined" ? window : this);
