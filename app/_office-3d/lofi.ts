"use client";
// Generative lo-fi for the office (WebAudio, no audio files): soft chords, kick, hats, a sparse melody and vinyl noise.
type Engine = { ctx: AudioContext; master: GainNode; lp: BiquadFilterNode; next: number; bar: number; timer: number };
let e: Engine | null = null;
let on = false, vol = 0.45;
let onChord: ((c: string) => void) | null = null;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS: [string, number[]][] = [["Am7", [57, 60, 64, 67]], ["Fmaj7", [53, 57, 60, 64]], ["Cmaj7", [48, 55, 59, 64]], ["G6", [55, 59, 62, 64]]];

function voice(type: OscillatorType, f: number, t: number, dur: number, gain: number, dest: AudioNode) {
  const c = e!.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.5, dur * 0.3)); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.15);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 1);
}
function schedule() {
  if (!e || !on) return; const c = e.ctx, beat = 60 / 72;
  while (e.next < c.currentTime + 0.4) {
    const t = e.next, [name, notes] = CHORDS[e.bar % 4]; onChord?.(name);
    notes.forEach(n => { voice("triangle", mtof(n), t, beat * 4, 0.035, e!.lp); voice("sine", mtof(n) * 1.003, t, beat * 4, 0.03, e!.lp); });
    voice("sine", mtof(notes[0] - 12), t, beat * 3.5, 0.09, e.lp);
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beat;
      if (b % 2 === 0) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, bt); o.frequency.exponentialRampToValueAtTime(40, bt + 0.18);
        g.gain.setValueAtTime(0.35, bt); g.gain.exponentialRampToValueAtTime(0.001, bt + 0.3); o.connect(g); g.connect(e.master); o.start(bt); o.stop(bt + 0.35); }
      const hb = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate), hd = hb.getChannelData(0); for (let i = 0; i < hd.length; i++) hd[i] = (Math.random() * 2 - 1) * (1 - i / hd.length);
      const hs = c.createBufferSource(); hs.buffer = hb; const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000; const hg = c.createGain(); hg.gain.value = 0.05;
      hs.connect(hp); hp.connect(hg); hg.connect(e.master); hs.start(bt + beat / 2);
      for (const h of [0, 0.5]) if (Math.random() < 0.32) { const pen = [69, 72, 74, 76, 79, 81]; voice("sine", mtof(pen[Math.floor(Math.random() * pen.length)]), bt + h * beat, beat * 0.9, 0.05, e.lp); }
    }
    e.next += beat * 4; e.bar++;
  }
}
export const lofi = {
  get playing() { return on; },
  start() {
    if (!e) {
      const ctx = new AudioContext(); const master = ctx.createGain(); master.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800; lp.connect(master); master.connect(ctx.destination);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() < 0.0008 ? Math.random() * 2 - 1 : 0) + (Math.random() * 2 - 1) * 0.012;
      const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; const ng = ctx.createGain(); ng.gain.value = 0.5; ns.connect(ng); ng.connect(master); ns.start();
      e = { ctx, master, lp, next: ctx.currentTime + 0.1, bar: 0, timer: window.setInterval(schedule, 100) };
    }
    e.ctx.resume(); on = true; e.next = Math.max(e.next, e.ctx.currentTime + 0.1); e.master.gain.setTargetAtTime(vol * 0.5, e.ctx.currentTime, 0.4);
  },
  stop() { if (!e) return; on = false; e.master.gain.setTargetAtTime(0, e.ctx.currentTime, 0.3); },
  volume(v: number) { vol = v; if (e && on) e.master.gain.setTargetAtTime(vol * 0.5, e.ctx.currentTime, 0.1); },
  onChord(f: ((c: string) => void) | null) { onChord = f; },
};
