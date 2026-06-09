/**
 * PuzzleWork Sound Design
 * ──────────────────────
 * Web Audio API で作る3つの音：
 *   playSnapSound()      — 接続成立時の「カチッ」
 *   playCompleteSound()  — ピース完了時の和音
 *   playResonanceSound() — 接続波紋が届いた周辺ピースへの微弱な反応
 *
 * すべてライブラリなし。ユーザーのインタラクション後に AudioContext を初期化。
 */

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  // Suspended の場合（ブラウザの自動再生制限）は再開を試みる
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// ─── ① 接続成立：カチッ ──────────────────────────────────────────────────────
export function playSnapSound(): void {
  try {
    const c = ctx();
    const now = c.currentTime;

    // Layer 1 — トランジェント（インパクト）
    const osc1 = c.createOscillator();
    const env1 = c.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(900, now);
    osc1.frequency.exponentialRampToValueAtTime(180, now + 0.055);
    env1.gain.setValueAtTime(0.28, now);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc1.connect(env1).connect(c.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Layer 2 — 余韻（共鳴）
    const osc2 = c.createOscillator();
    const env2 = c.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1400, now + 0.015);
    osc2.frequency.exponentialRampToValueAtTime(700, now + 0.13);
    env2.gain.setValueAtTime(0.12, now + 0.015);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc2.connect(env2).connect(c.destination);
    osc2.start(now + 0.015);
    osc2.stop(now + 0.14);
  } catch {
    // AudioContext 未許可の場合は無視
  }
}

// ─── ② ピース完了：Cmaj の和音 ──────────────────────────────────────────────
export function playCompleteSound(): void {
  try {
    const c = ctx();
    const now = c.currentTime;

    // C4 - E4 - G4 のアルペジオ（0ms / 70ms / 140ms）
    const freqs = [261.63, 329.63, 392.00];
    freqs.forEach((freq, i) => {
      const osc = c.createOscillator();
      const env = c.createGain();
      const t   = now + i * 0.07;

      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.18, t + 0.025);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

      osc.connect(env).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    });

    // ハーモニクス追加（E5 — 倍音）
    const harm = c.createOscillator();
    const harmEnv = c.createGain();
    harm.type = 'sine';
    harm.frequency.value = 659.25; // E5
    harmEnv.gain.setValueAtTime(0.001, now + 0.14);
    harmEnv.gain.linearRampToValueAtTime(0.06, now + 0.16);
    harmEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    harm.connect(harmEnv).connect(c.destination);
    harm.start(now + 0.14);
    harm.stop(now + 0.85);
  } catch {}
}

// ─── ③ 接続波紋が届いた周辺ピース：ソフトな反応音 ──────────────────────────
export function playResonanceSound(delayMs = 0): void {
  try {
    const c = ctx();
    const delay = delayMs / 1000;
    const now = c.currentTime + delay;

    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.18);
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.07, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(env).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {}
}

// ─── サウンドを事前に有効化（ユーザーのクリックイベントで呼ぶ） ──────────────
export function initAudio(): void {
  try { ctx(); } catch {}
}
