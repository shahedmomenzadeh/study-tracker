/**
 * Offline Audio Synthesizer via Web Audio API
 * Generates notification chimes and offline ambient focus soundscapes (rain, brown, white)
 */
const SoundManager = (() => {
  let audioCtx = null;
  let soundEnabled = true;
  let ambientVolume = 0.35;
  const activeAmbients = new Map(); // type -> { source, gain, filters, lfo }

  async function getContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextCtor();
    }
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      try {
        await audioCtx.resume();
      } catch (_) {
        // Ignore autoplay policy rejection until next user gesture
      }
    }
    return audioCtx;
  }

  // Play pleasant bell / chime notification for session complete, start, pause
  async function playNotification(type = 'complete') {
    if (!soundEnabled) return;
    try {
      const ctx = await getContext();
      if (!ctx) return;
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

  function createNoiseBuffer(ctx, mode) {
    const bufferSize = ctx.sampleRate * 3; // 3-second seamless loop
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (mode === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.2;
      }
    } else if (mode === 'rain') {
      // Pink-ish noise for soft rainfall texture
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
        b6 = white * 0.115926;
      }
    } else {
      // Gentle white noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.25;
      }
    }
    return buffer;
  }

  async function startAmbient(type = 'brown') {
    const validTypes = ['rain', 'brown', 'white'];
    const safeType = validTypes.includes(type) ? type : 'brown';

    if (activeAmbients.has(safeType)) return true;

    const pendingEntry = { pending: true };
    activeAmbients.set(safeType, pendingEntry);

    try {
      const ctx = await getContext();
      if (activeAmbients.get(safeType) !== pendingEntry) {
        return false; // Stopped while awaiting AudioContext
      }
      if (!ctx) {
        // Headless/Node fallback: track logical state for tests
        activeAmbients.set(safeType, { headless: true });
        return true;
      }

      const source = ctx.createBufferSource();
      source.buffer = createNoiseBuffer(ctx, safeType);
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      if (safeType === 'brown') {
        filter.type = 'lowpass';
        filter.frequency.value = 420;
      } else if (safeType === 'rain') {
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.6;
      } else {
        filter.type = 'lowpass';
        filter.frequency.value = 2600;
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(ambientVolume, ctx.currentTime + 0.35);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      activeAmbients.set(safeType, { source, filter, gain });
      return true;
    } catch (e) {
      console.warn('Ambient audio start error:', e);
      return false;
    }
  }

  function stopAmbient(type) {
    const entry = activeAmbients.get(type);
    if (!entry) return false;
    try {
      if (entry.source && typeof entry.source.stop === 'function') {
        entry.source.stop();
      }
      if (entry.source && typeof entry.source.disconnect === 'function') {
        entry.source.disconnect();
      }
      if (entry.gain && typeof entry.gain.disconnect === 'function') {
        entry.gain.disconnect();
      }
    } catch (_) {
      // Ignore already-stopped nodes
    }
    activeAmbients.delete(type);
    return true;
  }

  function stopAllAmbient() {
    Array.from(activeAmbients.keys()).forEach(stopAmbient);
  }

  function toggleAmbient(type = 'brown') {
    if (activeAmbients.has(type)) {
      stopAmbient(type);
      return false;
    }
    // Single active soundscape at a time for clean focus UX
    stopAllAmbient();
    startAmbient(type);
    return true;
  }

  function setAmbientVolume(vol) {
    const clamped = Math.max(0, Math.min(1, Number(vol)));
    if (isNaN(clamped)) return ambientVolume;
    ambientVolume = clamped;
    activeAmbients.forEach(entry => {
      if (entry.gain && audioCtx) {
        entry.gain.gain.setTargetAtTime(ambientVolume, audioCtx.currentTime, 0.08);
      }
    });
    return ambientVolume;
  }

  function getAmbientVolume() {
    return ambientVolume;
  }

  function isAmbientActive(type) {
    if (type) return activeAmbients.has(type);
    return activeAmbients.size > 0;
  }

  function getActiveAmbient() {
    const first = activeAmbients.keys().next();
    return first.done ? null : first.value;
  }

  function setSoundEnabled(enabled) {
    soundEnabled = !!enabled;
  }

  function isSoundEnabled() {
    return soundEnabled;
  }

  return {
    playNotification,
    setSoundEnabled,
    isSoundEnabled,
    toggleAmbient,
    startAmbient,
    stopAmbient,
    stopAllAmbient,
    setAmbientVolume,
    getAmbientVolume,
    isAmbientActive,
    getActiveAmbient
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundManager;
}
