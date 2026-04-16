/** Markdown report for corpus ICIJA batch (shared with retry script). */

export interface CorpusBatchReportRow {
  corpus: string;
  file: string;
  error?: string;
  scoreBefore: number;
  scoreAfter: number;
  metLocalTarget: boolean;
  semanticRan: boolean;
  outPdf?: string;
  durationMs: number;
  pdfafLocalPath?: string;
  icjiaRawPath?: string;
  localCategories?: Record<string, number | null>;
  icjia?: {
    overallScore?: number;
    grade?: string;
    ok: boolean;
    httpStatus: number;
    errorText?: string;
    categoryScores?: Record<string, number | null>;
    executiveSummary?: string;
  };
}

export function buildCorpusReportMd(args: {
  outRoot: string;
  generatedAt: string;
  batchTarget: number;
  icjiaUrl: string | null;
  icjiaIntervalMs: number | null;
  useSemantic: boolean;
  skipIcjia: boolean;
  results: CorpusBatchReportRow[];
  /** Appended under title when set (e.g. after a retry pass). */
  subtitleNote?: string;
}): string {
  const {
    outRoot,
    generatedAt,
    batchTarget,
    icjiaUrl,
    icjiaIntervalMs,
    useSemantic,
    skipIcjia,
    results,
    subtitleNote,
  } = args;
  const okRows = results.filter(r => !r.error);
  const errRows = results.filter(r => r.error);
  const localMet = okRows.filter(r => r.metLocalTarget).length;
  const icjiaRows = okRows.filter(r => r.icjia?.ok && typeof r.icjia.overallScore === 'number');
  const icjiaMet95 = icjiaRows.filter(r => (r.icjia!.overallScore as number) >= 95).length;
  const icjiaScores = icjiaRows.map(r => r.icjia!.overallScore as number);
  const avgIcjia =
    icjiaScores.length > 0 ? (icjiaScores.reduce((a, b) => a + b, 0) / icjiaScores.length).toFixed(1) : '—';
  const minIcjia = icjiaScores.length > 0 ? Math.min(...icjiaScores) : null;
  const maxIcjia = icjiaScores.length > 0 ? Math.max(...icjiaScores) : null;
  const localAfter = okRows.map(r => r.scoreAfter);
  const avgLocal =
    localAfter.length > 0 ? (localAfter.reduce((a, b) => a + b, 0) / localAfter.length).toFixed(1) : '—';

  const byCorpus = (label: string) => results.filter(r => r.corpus === label);

  let md = `# Corpus 1 & 2 — PDFAF remediation + ICIJA audit\n\n`;
  if (subtitleNote) md += `${subtitleNote}\n\n`;
  md += `Generated: **${generatedAt}**  \n`;
  md += `Output directory: \`${outRoot}\`  \n`;
  md += `Local target (PDFAF): **≥ ${batchTarget}**  \n`;
  md += `Semantic passes: **${useSemantic ? 'on' : 'off'}**  \n`;
  md += `ICJIA: **${skipIcjia ? 'skipped (--skip-icjia)' : icjiaUrl ?? 'n/a'}**`;
  if (!skipIcjia && icjiaIntervalMs != null) md += ` (min interval ${icjiaIntervalMs} ms)`;
  md += `\n\n---\n\n## Where we stand\n\n`;
  md += `| Metric | Count / value |\n| --- | ---: |\n`;
  md += `| Jobs (total) | ${results.length} |\n`;
  md += `| Errors | ${errRows.length} |\n`;
  md += `| PDFAF ≥ ${batchTarget} after remediation | ${localMet} / ${okRows.length} |\n`;
  if (!skipIcjia) {
    md += `| ICIJA HTTP success | ${icjiaRows.length} / ${okRows.length} |\n`;
    md += `| ICIJA overall ≥ 95 | ${icjiaMet95} / ${icjiaRows.length || '—'} |\n`;
    md += `| ICIJA overall (min / avg / max) | ${minIcjia ?? '—'} / ${avgIcjia} / ${maxIcjia ?? '—'} |\n`;
  }
  md += `| PDFAF overall (avg after) | ${avgLocal} |\n\n`;

  md += `### Per-corpus (PDFAF met target)\n\n`;
  for (const label of ['corpus_1', 'corpus_2']) {
    const rows = byCorpus(label).filter(r => !r.error);
    const met = rows.filter(r => r.metLocalTarget).length;
    md += `- **${label}**: ${met} / ${rows.length} reached local ≥ ${batchTarget}\n`;
  }
  md += `\n`;

  md += `### Inspecting ICIJA vs PDFAF\n\n`;
  md += `Each job writes:\n`;
  md += `- \`pdfaf_local/<stem>_local.json\` — PDFAF category scores after remediation\n`;
  md += `- \`icjia_api_raw/<stem>_icjia.json\` — **full** ICIJA response (\`findings\`, \`executiveSummary\`, weights)\n\n`;
  md += `Use these side-by-side when ICIJA disagrees (e.g. reading order, table markup, struct tree visibility).\n\n---\n\n`;

  if (!skipIcjia) {
    md += `## PDFAF vs ICIJA overall (gap)\n\n`;
    md += `| Corpus | File | PDFAF after | ICIJA overall | Δ (PDFAF − ICIJA) |\n`;
    md += '| --- | --- | ---: | ---: | ---: |\n';
    for (const r of results) {
      if (r.error || !r.icjia?.ok || typeof r.icjia.overallScore !== 'number') continue;
      const d = r.scoreAfter - r.icjia.overallScore;
      md += `| ${r.corpus} | ${r.file} | ${r.scoreAfter} | ${r.icjia.overallScore} | ${d >= 0 ? '+' : ''}${d} |\n`;
    }
    md += `\n`;
  }

  md += `## Per-file summary\n\n`;
  md +=
    '| Corpus | File | PDFAF before | PDFAF after | Met local | ICIJA score | ICIJA grade | Duration (s) | PDFAF JSON | ICIJA JSON |\n';
  md += '| --- | --- | ---: | ---: | :---: | ---: | --- | ---: | --- | --- |\n';
  for (const r of results) {
    const met = r.error ? 'ERROR' : r.metLocalTarget ? 'yes' : 'no';
    const icjSc =
      r.error || !r.icjia
        ? '—'
        : r.icjia.ok && typeof r.icjia.overallScore === 'number'
          ? String(r.icjia.overallScore)
          : `err ${r.icjia.httpStatus}`;
    const icjGr = r.error || !r.icjia?.ok ? '—' : (r.icjia.grade ?? '—');
    const pPath = r.pdfafLocalPath ? `[local](./${r.pdfafLocalPath})` : '—';
    const iPath = r.icjiaRawPath ? `[icjia](./${r.icjiaRawPath})` : skipIcjia ? '—' : '—';
    md += `| ${r.corpus} | ${r.file} | ${r.error ? '—' : r.scoreBefore} | ${r.error ? '—' : r.scoreAfter} | ${met} | ${icjSc} | ${icjGr} | ${(r.durationMs / 1000).toFixed(1)} | ${pPath} | ${iPath} |\n`;
  }

  md += `\n## ICIJA lowest categories (quick view)\n\n`;
  md += `Per file, ICIJA categories with score \`< 95\` (null = N/A):\n\n`;
  for (const r of results) {
    if (r.error || !r.icjia?.categoryScores) continue;
    const low = Object.entries(r.icjia.categoryScores).filter(
      ([, v]) => v !== null && v !== undefined && v < 95,
    );
    if (low.length === 0 && r.icjia.ok) {
      md += `- **${r.corpus}/${r.file}**: all scored categories ≥ 95 (or only N/A)\n`;
      continue;
    }
    const parts = low.map(([k, v]) => `${k}=${v}`).join(', ');
    md += `- **${r.corpus}/${r.file}**: ${parts || '(see raw JSON)'}\n`;
  }

  md += `\n## Executive summaries (ICJIA)\n\n`;
  for (const r of results) {
    if (r.error || !r.icjia?.executiveSummary) continue;
    md += `### ${r.corpus} / ${r.file}\n\n`;
    md += `${r.icjia.executiveSummary}\n\n`;
  }

  if (errRows.length > 0) {
    md += `\n## Errors\n\n`;
    for (const r of errRows) {
      md += `- **${r.corpus}/${r.file}**: ${r.error}\n`;
    }
  }

  return md;
}
