/**
 * Describe API – calls backend to get a mathematical description of the function from equation + graph image.
 */
(function (global) {
    "use strict";

    function describeFunction(equation, imageDataUrl) {
        var base64 = imageDataUrl;
        if (typeof imageDataUrl === "string" && imageDataUrl.indexOf("base64,") !== -1) {
            base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        }
        if (typeof console !== "undefined" && console.log) {
            console.log("[describe-api] request equation:", equation, "image length:", base64.length);
        }
        var baseUrl = (global.AudibleMath && global.AudibleMath.apiBase) || "";
        return fetch(baseUrl + "/api/describe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ equation: equation, imageBase64: base64 })
        })
            .then(function (res) {
                if (!res.ok) {
                    return res.json().then(function (data) {
                        var msg = data && data.error ? data.error : "Describe request failed";
                        if (typeof console !== "undefined" && console.error) {
                            console.error("[describe-api] error response:", res.status, msg);
                        }
                        throw new Error(msg);
                    }, function () {
                        throw new Error("Describe request failed: " + res.status + " " + res.statusText);
                    });
                }
                return res.json();
            })
            .then(function (data) {
                var desc = data.description || "";
                if (typeof console !== "undefined" && console.log) {
                    console.log("[describe-api] response description length:", desc.length);
                    console.log("[describe-api] description (full):", desc);
                }
                return desc;
            });
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.describeApi = {
        describeFunction: describeFunction
    };
})(typeof window !== "undefined" ? window : this);
