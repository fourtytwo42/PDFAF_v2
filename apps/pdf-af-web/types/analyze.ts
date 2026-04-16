export type AnalyzeSeverity = 'critical' | 'moderate' | 'minor' | 'pass';

export type AnalyzeGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type AnalyzePdfClass = 'native_tagged' | 'native_untagged' | 'scanned' | 'mixed';

export interface FindingReference {
  label: string;
  href: string;
  source: 'wcag' | 'adobe';
}

export interface NormalizedFinding {
  id: string;
  title: string;
  summary: string;
  category: string;
  severity: AnalyzeSeverity;
  count?: number;
  page?: number;
  references: FindingReference[];
}

export interface AnalyzeCategorySummary {
  key: string;
  label: string;
  score: number;
  severity: AnalyzeSeverity;
  applicable: boolean;
  findingCount: number;
}

export interface AnalyzeSummary {
  score: number;
  grade: AnalyzeGrade;
  pageCount: number;
  pdfClass: AnalyzePdfClass;
  analysisDurationMs: number;
  categories: AnalyzeCategorySummary[];
  findings: NormalizedFinding[];
  topFindings: NormalizedFinding[];
}

export interface RawAnalyzeFinding {
  category: string;
  severity: AnalyzeSeverity;
  wcag: string;
  message: string;
  count?: number;
  page?: number;
}

export interface RawAnalyzeCategory {
  key: string;
  score: number;
  weight: number;
  applicable: boolean;
  severity: AnalyzeSeverity;
  findings: RawAnalyzeFinding[];
}

export interface RawAnalyzeResponse {
  id: string;
  timestamp: string;
  filename: string;
  pageCount: number;
  pdfClass: AnalyzePdfClass;
  score: number;
  grade: AnalyzeGrade;
  categories: RawAnalyzeCategory[];
  findings: RawAnalyzeFinding[];
  analysisDurationMs: number;
}
