/**
 * Entry bar – Desmos-like input with LaTeX preview, parameter sliders, and error feedback.
 * Depends: expression-manager, math-engine, KaTeX (global katex).
 */
(function (global) {
    "use strict";

    var expressionManager = global.AudibleMath && global.AudibleMath.expressionManager;
    var mathEngine = global.AudibleMath && global.AudibleMath.mathEngine;
    if (!expressionManager || !mathEngine) return;

    var container = null;
    var inputEl = null;
    var previewEl = null;
    var errorEl = null;
    var slidersContainer = null;
    var debounceTimer = null;
    var DEBOUNCE_MS = 120;

    function renderLatex(expr, intoEl) {
        if (!intoEl) return;
        var latex = mathEngine.toTex(expr);
        if (typeof katex !== "undefined") {
            try {
                intoEl.innerHTML = katex.renderToString(latex || "\\ ", {
                    throwOnError: false,
                    displayMode: false,
                    output: "html"
                });
                intoEl.classList.remove("entry-bar-preview--empty");
                intoEl.classList.remove("entry-bar-preview--error");
            } catch (e) {
                intoEl.textContent = latex || "";
                intoEl.classList.add("entry-bar-preview--error");
            }
        } else {
            intoEl.textContent = latex || "y = ";
            intoEl.classList.remove("entry-bar-preview--empty");
        }
    }

    function syncFromManager() {
        var input = expressionManager.getInput();
        if (inputEl && inputEl.value !== input) inputEl.value = input;
        renderLatex(input, previewEl);
        setError(expressionManager.isValid() ? "" : expressionManager.getError());
        rebuildSliders();
    }

    function setError(msg) {
        if (!errorEl) return;
        errorEl.textContent = msg || "";
        errorEl.classList.toggle("entry-bar-error--visible", !!msg);
    }

    function rebuildSliders() {
        if (!slidersContainer) return;
        slidersContainer.innerHTML = "";
        var names = expressionManager.getParameterNames();
        var params = expressionManager.getParameters();
        var range = expressionManager.defaultParamRange;

        names.forEach(function (name) {
            var wrap = document.createElement("div");
            wrap.className = "entry-bar-slider-wrap";

            var label = document.createElement("label");
            label.setAttribute("for", "param-" + name);
            label.textContent = name + ":";

            var slider = document.createElement("input");
            slider.type = "range";
            slider.id = "param-" + name;
            slider.className = "entry-bar-slider";
            slider.min = range.min;
            slider.max = range.max;
            slider.step = range.step;
            slider.value = params[name] != null ? params[name] : 1;

            var valueSpan = document.createElement("span");
            valueSpan.className = "entry-bar-slider-value";
            valueSpan.textContent = slider.value;

            slider.addEventListener("input", function () {
                var val = parseFloat(this.value);
                valueSpan.textContent = Number.isInteger(val) ? val : val.toFixed(2);
                expressionManager.setParameter(name, val);
            });

            wrap.appendChild(label);
            wrap.appendChild(slider);
            wrap.appendChild(valueSpan);
            slidersContainer.appendChild(wrap);
        });
    }

    function onManagerChange(payload) {
        renderLatex(expressionManager.getInput(), previewEl);
        setError(payload.error || "");
        if (payload.valid) rebuildSliders();
    }

    function onManagerParamsChange() {
        rebuildSliders();
    }

    function flushInput() {
        if (inputEl) expressionManager.setInput(inputEl.value.trim());
    }

    function scheduleSync() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            flushInput();
        }, DEBOUNCE_MS);
    }

    function init(containerId) {
        container = document.getElementById(containerId || "entry-bar");
        if (!container) return;

        container.innerHTML =
            "<div class=\"entry-bar-row\">" +
            "  <div class=\"entry-bar-input-wrap\">" +
            "    <input type=\"text\" class=\"entry-bar-input\" placeholder=\"y = 2x^2 + 3, y = a sin(x), y = e^x\" autocomplete=\"off\" spellcheck=\"false\" aria-label=\"Function expression\" />" +
            "    <div class=\"entry-bar-preview entry-bar-preview--empty\" aria-live=\"polite\"></div>" +
            "  </div>" +
            "</div>" +
            "<div class=\"entry-bar-error\" id=\"entry-bar-error\" role=\"alert\"></div>" +
            "<div class=\"entry-bar-sliders\" id=\"entry-bar-sliders\"></div>";

        inputEl = container.querySelector(".entry-bar-input");
        previewEl = container.querySelector(".entry-bar-preview");
        errorEl = document.getElementById("entry-bar-error");
        slidersContainer = document.getElementById("entry-bar-sliders");

        inputEl.addEventListener("input", function () {
            renderLatex(this.value, previewEl);
            setError("");
            scheduleSync();
        });
        inputEl.addEventListener("blur", flushInput);
        inputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                flushInput();
                inputEl.blur();
            }
        });

        expressionManager.on("change", onManagerChange);
        expressionManager.on("paramsChange", onManagerParamsChange);
        syncFromManager();
    }

    function destroy() {
        if (debounceTimer) clearTimeout(debounceTimer);
        expressionManager.off("change", onManagerChange);
        expressionManager.off("paramsChange", onManagerParamsChange);
        container = inputEl = previewEl = errorEl = slidersContainer = null;
    }

    function getInputElement() { return inputEl; }
    function focusInput() { if (inputEl) inputEl.focus(); }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.entryBar = {
        init: init,
        destroy: destroy,
        syncFromManager: syncFromManager,
        getInputElement: getInputElement,
        focusInput: focusInput
    };
})(typeof window !== "undefined" ? window : this);
