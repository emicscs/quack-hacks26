/**
 * Voice intro – SpeechSynthesis for short intro on load (instructions only, no graph details).
 */
(function (global) {
    "use strict";

    function speakIntro(functionLabel, domain) {
        if (!window.speechSynthesis) return;
        var text = "Use left and right arrows to move along the graph. Use up and down arrows to adjust the step interval. Press Space to return to the origin.";
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
