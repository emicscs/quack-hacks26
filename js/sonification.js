/**
 * Sonification – Web Audio oscillator; pitch maps from y-value.
 * Phase 1: single oscillator, frequency = f(y). Invalid/NaN → mute or error tone.
 */
(function (global) {
    "use strict";

    var audioContext = null;
    var oscillator = null;
    var gainNode = null;
    var isRunning = false;
    var playbackTimerId = null;
    var maxPlaybackMs = 500;

    var FREQ_MIN = 110;
    var FREQ_MAX = 880;
    var Y_CLAMP = 10;
    var MAX_PLAYBACK_MIN_MS = 100;
    var MAX_PLAYBACK_MAX_MS = 30000;

    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    function ensureOscillator() {
        var ctx = getAudioContext();
        if (oscillator) return;
        gainNode = ctx.createGain();
        gainNode.gain.value = 0.15;
        gainNode.connect(ctx.destination);
        oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        oscillator.connect(gainNode);
        oscillator.start(0);
        isRunning = true;
    }

    function clearPlaybackTimer() {
        if (playbackTimerId) {
            clearTimeout(playbackTimerId);
            playbackTimerId = null;
        }
    }

    function clampPlaybackMs(value) {
        var n = parseFloat(value);
        if (!isFinite(n)) return 500;
        n = Math.round(n);
        if (n < MAX_PLAYBACK_MIN_MS) return MAX_PLAYBACK_MIN_MS;
        if (n > MAX_PLAYBACK_MAX_MS) return MAX_PLAYBACK_MAX_MS;
        return n;
    }

    function scheduleAutoStop() {
        clearPlaybackTimer();
        playbackTimerId = setTimeout(function () {
            stop();
        }, maxPlaybackMs);
    }

    /**
     * Map y to frequency (linear between FREQ_MIN and FREQ_MAX).
     * Clamp y to [-Y_CLAMP, Y_CLAMP] for audible range.
     */
    function yToFrequency(y) {
        var t = (y + Y_CLAMP) / (2 * Y_CLAMP);
        t = Math.max(0, Math.min(1, t));
        return FREQ_MIN + t * (FREQ_MAX - FREQ_MIN);
    }

    /**
     * Set oscillator frequency from current y. If !isValid (NaN/undefined), mute or use error tone.
     */
    function setFrequencyFromY(y, isValid) {
        ensureOscillator();
        if (!oscillator) return;
        if (!isValid) {
            gainNode.gain.setTargetAtTime(0.05, audioContext.currentTime, 0.02);
            oscillator.frequency.setTargetAtTime(220, audioContext.currentTime, 0.02);
            scheduleAutoStop();
            return;
        }
        gainNode.gain.setTargetAtTime(0.15, audioContext.currentTime, 0.02);
        var freq = yToFrequency(y);
        oscillator.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.02);
        scheduleAutoStop();
    }

    function stop() {
        clearPlaybackTimer();
        if (gainNode) {
            gainNode.gain.setTargetAtTime(0, audioContext ? audioContext.currentTime : 0, 0.05);
        }
        isRunning = false;
    }

    function setMaxPlaybackMs(ms) {
        maxPlaybackMs = clampPlaybackMs(ms);
        return maxPlaybackMs;
    }

    function getMaxPlaybackMs() {
        return maxPlaybackMs;
    }

    function playBlockedCue() {
        var ctx = getAudioContext();
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.11);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    global.AudibleMath = global.AudibleMath || {};
    global.AudibleMath.sonification = {
        setFrequencyFromY: setFrequencyFromY,
        stop: stop,
        getAudioContext: getAudioContext,
        setMaxPlaybackMs: setMaxPlaybackMs,
        getMaxPlaybackMs: getMaxPlaybackMs,
        playBlockedCue: playBlockedCue
    };
})(typeof window !== "undefined" ? window : this);
