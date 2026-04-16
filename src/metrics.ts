/** In-process remediation samples for health / ops (Phase 5). */

const remediateSamples: { at: number; ms: number }[] = [];
const MAX_SAMPLES = 5000;

export function recordRemediation(durationMs: number): void {
  remediateSamples.push({ at: Date.now(), ms: durationMs });
  while (remediateSamples.length > MAX_SAMPLES) {
    remediateSamples.shift();
  }
}

export function remediationStatsLast24h(): { count: number; avgMs: number } {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = remediateSamples.filter(s => s.at >= cutoff);
  if (recent.length === 0) return { count: 0, avgMs: 0 };
  const sum = recent.reduce((a, s) => a + s.ms, 0);
  return { count: recent.length, avgMs: Math.round(sum / recent.length) };
}
