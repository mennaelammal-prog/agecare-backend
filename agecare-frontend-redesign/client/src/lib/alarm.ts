/**
 * A dependency-free "alarm clock" ring, synthesized entirely with the Web
 * Audio API -- two alternating tones, repeated on a loop until stopped.
 * Deliberately not an audio file: this repo already hit a real problem
 * downloading generated image assets through a CDN this environment
 * couldn't reach (see the images self-hosting work) -- a synthesized tone
 * needs nothing to host, download, or go stale.
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

export function playAlarmTone() {
  stopAlarmTone();
  const ctx = getContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const beep = (startTime: number, frequency: number) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.28);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.3);
    activeOscillators.push(oscillator);
  };

  const cycle = () => {
    const now = ctx.currentTime;
    beep(now, 880);
    beep(now + 0.35, 660);
    repeatTimer = setTimeout(cycle, 800);
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
