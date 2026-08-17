/**
 * A dependency-free ringing tone, synthesized entirely with the Web Audio
 * API -- a soft two-note chime, repeated until stopped. Deliberately not an
 * audio file: this repo already hit a real problem downloading generated
 * image assets through a CDN this environment couldn't reach (see the
 * images self-hosting work) -- a synthesized tone needs nothing to host,
 * download, or go stale.
 *
 * Originally a sharp double-beep alarm-clock tone; changed to a gentler
 * bell-like chime (soft attack, slow natural decay, spaced further apart)
 * after real feedback that the first version was too harsh for what's
 * meant to be a calm care app, not an urgent klaxon.
 */
let audioContext: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];
let repeatTimer: ReturnType<typeof setTimeout> | null = null;

function getContext() {
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio is not available in this browser.");
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

/** One soft, bell-like note: gentle attack, slow exponential decay -- not a beep. */
function chime(ctx: AudioContext, startTime: number, frequency: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.16, startTime + 0.2); // soft attack, not a sharp hit
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // slow, natural fade
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
  activeOscillators.push(oscillator);
}

export function playAlarmTone() {
  stopAlarmTone();
  const ctx = getContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const cycle = () => {
    const now = ctx.currentTime;
    // A quiet falling third (E5 -> C5), like a soft door chime -- not an
    // urgent double-beep -- repeated every few seconds rather than rapidly.
    chime(ctx, now, 659.25, 1.6);
    chime(ctx, now + 1.0, 523.25, 1.8);
    repeatTimer = setTimeout(cycle, 4000);
  };
  cycle();
}

export function stopAlarmTone() {
  if (repeatTimer) {
    clearTimeout(repeatTimer);
    repeatTimer = null;
  }
  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      // Already finished on its own -- nothing to stop.
    }
  }
  activeOscillators = [];
}
