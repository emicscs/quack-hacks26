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
        return fetch("/api/describe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ equation: equation, imageBase64: base64 })
        })
            .then(function (res) {
                if (!res.ok) {
                    return res.json().then(function (data) {
                        var msg = data && data.error ? data.error : "Describe request failed";
                        throw new Error(msg);
                    }, function () {
                        throw new Error("Describe request failed: " + res.status + " " + res.statusText);
                    });
                }
                return res.json();
            })
            .then(function (data) {
                return data.description || "";
            });
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.describeApi = {
        describeFunction: describeFunction
    };
})(typeof window !== "undefined" ? window : this);
