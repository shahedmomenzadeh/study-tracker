/**
 * Offline Audio Synthesizer via Web Audio API
 * Generates notification chimes directly in the browser!
 */
const SoundManager = (() => {
  let audioCtx = null;
  let soundEnabled = true;

  function getContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Play pleasant bell / chime notification for session complete, start, pause
  function playNotification(type = 'complete') {
    if (!soundEnabled) return;
    try {
      const ctx = getContext();
      const now = ctx.currentTime;

      if (type === 'complete') {
        // Dual bell chime (E5 -> G#5 -> B5 -> E6)
        const notes = [659.25, 830.61, 987.77, 1318.51];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.15);

          gain.gain.setValueAtTime(0, now + idx * 0.15);
          gain.gain.linearRampToValueAtTime(0.35, now + idx * 0.15 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 1.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.15);
          osc.stop(now + idx * 0.15 + 1.25);
        });
      } else if (type === 'start') {
        // Short bright click/tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'pause') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function setSoundEnabled(enabled) {
    soundEnabled = enabled;
  }

  return {
    playNotification,
    setSoundEnabled,
    toggleAmbient: () => false,
    startAmbient: () => {},
    stopAmbient: () => {},
    stopAllAmbient: () => {},
    setAmbientVolume: () => {},
    isAmbientActive: () => false
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundManager;
}
