/**
 * Voice intro – SpeechSynthesis for short intro before graph "plays".
 * Phase 1: "Graph of f(x) = … from x = … to …"
 */
(function (global) {
    "use strict";

    function speakIntro(functionLabel, domain) {
        if (!window.speechSynthesis) return;
        var domainMin = domain && domain.min != null ? domain.min.toFixed(1) : "?";
        var domainMax = domain && domain.max != null ? domain.max.toFixed(1) : "?";
        var text = "Graph of " + functionLabel + ", from x equals " + domainMin + " to " + domainMax + ". Use left and right arrow keys to move.";
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.voiceIntro = {
        speakIntro: speakIntro
    };
})(typeof window !== "undefined" ? window : this);
