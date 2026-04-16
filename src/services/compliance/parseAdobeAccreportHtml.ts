/**
 * Parse Adobe Acrobat "Accessibility Report" HTML (*.accreport.html).
 * Table rows: Rule link | Status | Description
 */

export type AdobeAccReportStatus =
  | 'Passed'
  | 'Failed'
  | 'Skipped'
  | 'Needs manual check';

export interface AdobeAccReportRow {
  /** Fragment from Acrobat help URL, e.g. TaggedCont, FigAltText */
  anchor: string;
  ruleName: string;
  status: AdobeAccReportStatus;
  description: string;
}

export interface AdobeAccReportSummary {
  needsManualCheck: number;
  passedManually: number;
  failedManually: number;
  skipped: number;
  passed: number;
  failed: number;
}

export interface AdobeAccReport {
  filename: string | null;
  summary: AdobeAccReportSummary | null;
  rows: AdobeAccReportRow[];
}

function parseSummary(html: string): AdobeAccReportSummary | null {
  const nums = {
    needsManualCheck: /<li>Needs manual check:\s*(\d+)/i,
    passedManually: /<li>Passed manually:\s*(\d+)/i,
    failedManually: /<li>Failed manually:\s*(\d+)/i,
    skipped: /<li>Skipped:\s*(\d+)/i,
    passed: /<li>Passed:\s*(\d+)/i,
    failed: /<li>Failed:\s*(\d+)/i,
  } as const;
  const out: Partial<AdobeAccReportSummary> = {};
  for (const [k, re] of Object.entries(nums)) {
    const m = html.match(re);
    if (!m) return null;
    out[k as keyof AdobeAccReportSummary] = parseInt(m[1]!, 10);
  }
  return out as AdobeAccReportSummary;
}

function parseFilename(html: string): string | null {
  const m = html.match(/<dt>Filename:\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  return m ? m[1]!.trim() : null;
}

const ROW_RE =
  /<tr><td><a\s+href="([^"]+)">([^<]+)<\/a><\/td><td>(Passed|Failed|Skipped|Needs manual check)<\/td><td>([^<]*)<\/td><\/tr>/gi;

function anchorFromHref(href: string): string {
  const hash = href.lastIndexOf('#');
  return hash >= 0 ? href.slice(hash + 1) : href;
}

export function parseAdobeAccessibilityReportHtml(html: string): AdobeAccReport {
  const rows: AdobeAccReportRow[] = [];
  let m: RegExpExecArray | null;
  ROW_RE.lastIndex = 0;
  while ((m = ROW_RE.exec(html)) !== null) {
    const href = m[1]!;
    const ruleName = m[2]!.trim();
    const status = m[3] as AdobeAccReportStatus;
    const description = (m[4] ?? '').trim();
    rows.push({
      anchor: anchorFromHref(href),
      ruleName,
      status,
      description,
    });
  }
  return {
    filename: parseFilename(html),
    summary: parseSummary(html),
    rows,
  };
}

export function failedAdobeAnchors(report: AdobeAccReport): string[] {
  return [...new Set(report.rows.filter(r => r.status === 'Failed').map(r => r.anchor))];
}
