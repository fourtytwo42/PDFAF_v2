import type {
  AnalyzeCategorySummary,
  AnalyzeSummary,
  FindingReference,
  NormalizedFinding,
  RawAnalyzeFinding,
  RawAnalyzeResponse,
} from '../../types/analyze';

const WCAG_REFERENCE_OVERRIDES: Record<string, string> = {
  '1.1.1': 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
  '1.3.1': 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
  '2.4.2': 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
  '2.4.4': 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html',
  '2.4.6': 'https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels.html',
  '3.1.1': 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html',
  '4.1.2': 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
};

const ADOBE_ACCESSIBILITY_CHECKER_URL =
  'https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html';
const ADOBE_READING_ORDER_URL =
  'https://helpx.adobe.com/acrobat/using/touch-reading-order-tool-pdfs.html';
const ADOBE_AUTOTAG_URL =
  'https://helpx.adobe.com/acrobat/using/cloud-auto-tagging-accessibility-pdfs.html';
const ADOBE_TABLE_HEADERS_URL =
  'https://helpx.adobe.com/ph_fil/acrobat/kb/table-header-fails-in-accessibility-checker.html';

interface AdobeReferenceRule {
  category: string;
  label: string;
  href: string;
  patterns: RegExp[];
}

const ADOBE_REFERENCE_RULES: AdobeReferenceRule[] = [
  {
    category: 'alt_text',
    label: 'Adobe alt text guidance',
    href: ADOBE_READING_ORDER_URL,
    patterns: [/alt/i, /figure/i, /decorative/i, /annotation/i],
  },
  {
    category: 'heading_structure',
    label: 'Adobe heading guidance',
    href: ADOBE_ACCESSIBILITY_CHECKER_URL,
    patterns: [/heading/i, /H[1-6]/i, /nest/i],
  },
  {
    category: 'table_markup',
    label: 'Adobe table header guidance',
    href: ADOBE_TABLE_HEADERS_URL,
    patterns: [/table/i, /header/i, /TH/i, /TD/i, /TR/i],
  },
  {
    category: 'reading_order',
    label: 'Adobe reading order guidance',
    href: ADOBE_READING_ORDER_URL,
    patterns: [/reading order/i, /tab order/i, /annotation/i],
  },
  {
    category: 'link_quality',
    label: 'Adobe link tagging guidance',
    href: ADOBE_READING_ORDER_URL,
    patterns: [/link/i, /annotation/i],
  },
  {
    category: 'title_language',
    label: 'Adobe title and language guidance',
    href: ADOBE_ACCESSIBILITY_CHECKER_URL,
    patterns: [/title/i, /language/i, /lang/i],
  },
  {
    category: 'text_extractability',
    label: 'Adobe OCR and tagging guidance',
    href: ADOBE_AUTOTAG_URL,
    patterns: [/unicode/i, /encoding/i, /text/i, /extractable/i, /scanned/i],
  },
  {
    category: 'bookmarks',
    label: 'Adobe bookmarks guidance',
    href: ADOBE_ACCESSIBILITY_CHECKER_URL,
    patterns: [/bookmark/i, /outline/i],
  },
  {
    category: 'pdf_ua_compliance',
    label: 'Adobe accessibility checker guidance',
    href: ADOBE_ACCESSIBILITY_CHECKER_URL,
    patterns: [/tag/i, /structure/i, /marked/i, /PDF\/UA/i],
  },
  {
    category: 'form_accessibility',
    label: 'Adobe form tagging guidance',
    href: ADOBE_READING_ORDER_URL,
    patterns: [/form/i, /field/i, /label/i],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  text_extractability: 'Text Extractability',
  title_language: 'Title and Language',
  heading_structure: 'Heading Structure',
  alt_text: 'Alt Text',
  pdf_ua_compliance: 'PDF/UA Compliance',
  bookmarks: 'Bookmarks',
  table_markup: 'Table Markup',
  color_contrast: 'Color Contrast',
  link_quality: 'Link Quality',
  reading_order: 'Reading Order',
  form_accessibility: 'Form Accessibility',
};

const MAX_DRAWER_FINDINGS = 10;
const MAX_ROW_FINDINGS = 3;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function formatCategoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function buildWcagReference(code: string): FindingReference | null {
  const normalizedCode = code.trim();
  if (!normalizedCode) return null;

  return {
    label: `WCAG ${normalizedCode}`,
    href:
      WCAG_REFERENCE_OVERRIDES[normalizedCode] ??
      `https://www.w3.org/WAI/WCAG21/Understanding/${normalizedCode}.html`,
    source: 'wcag',
  };
}

function buildAdobeReferences(finding: RawAnalyzeFinding): FindingReference[] {
  const rule = ADOBE_REFERENCE_RULES.find(
    (candidate) =>
      candidate.category === finding.category &&
      candidate.patterns.some((pattern) => pattern.test(finding.message)),
  );

  return rule
    ? [
        {
          label: rule.label,
          href: rule.href,
          source: 'adobe',
        },
      ]
    : [];
}

function summarizeFindingTitle(finding: RawAnalyzeFinding): string {
  const categoryLabel = formatCategoryLabel(finding.category);

  if (finding.message.length <= 84) {
    return finding.message;
  }

  const compact = finding.message.split('. ')[0]?.trim();
  if (compact && compact.length <= 84) {
    return compact;
  }

  return categoryLabel;
}

function normalizeFinding(finding: RawAnalyzeFinding, index: number): NormalizedFinding {
  const references = [
    ...buildAdobeReferences(finding),
    ...(finding.wcag ? [buildWcagReference(finding.wcag)].filter(Boolean) : []),
  ] as FindingReference[];
  const bounds = normalizeFindingBounds(finding);

  return {
    id: `${finding.category}-${slugify(finding.message)}-${index}`,
    title: summarizeFindingTitle(finding),
    summary: finding.message,
    category: formatCategoryLabel(finding.category),
    severity: finding.severity,
    count: finding.count,
    page: finding.page,
    ...(bounds ? { bounds } : {}),
    references,
  };
}

function normalizeFindingBounds(finding: RawAnalyzeFinding): NormalizedFinding['bounds'] | null {
  if (finding.bounds) {
    const { x, y, width, height } = finding.bounds;
    if ([x, y, width, height].every((value) => Number.isFinite(value))) {
      return { x, y, width, height };
    }
  }

  if (Array.isArray(finding.bbox) && finding.bbox.length === 4) {
    const [x1, y1, x2, y2] = finding.bbox;
    if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }
  }

  return null;
}

function actionableFindings(findings: RawAnalyzeFinding[]): RawAnalyzeFinding[] {
  const severityRank = { critical: 0, moderate: 1, minor: 2, pass: 3 };

  return findings
    .filter((finding) => finding.severity !== 'pass')
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);
}

export function normalizeAnalyzePayload(payload: RawAnalyzeResponse): AnalyzeSummary {
  const categories: AnalyzeCategorySummary[] = payload.categories.map((category) => ({
    key: category.key,
    label: formatCategoryLabel(category.key),
    score: category.score,
    severity: category.severity,
    applicable: category.applicable,
    findingCount: category.findings.filter((finding) => finding.severity !== 'pass').length,
  }));

  const findings = actionableFindings(payload.findings)
    .slice(0, MAX_DRAWER_FINDINGS)
    .map((finding, index) => normalizeFinding(finding, index));

  return {
    score: payload.score,
    grade: payload.grade,
    pageCount: payload.pageCount,
    pdfClass: payload.pdfClass,
    analysisDurationMs: payload.analysisDurationMs,
    categories,
    findings,
    topFindings: findings.slice(0, MAX_ROW_FINDINGS),
  };
}

export function normalizeAnalyzeResponse(payload: RawAnalyzeResponse): AnalyzeSummary {
  return normalizeAnalyzePayload(payload);
}
