/**
 * Keyword-based document domain for LLM prompt conditioning (no LLM call).
 */

export type DocumentDomain =
  | 'legal'
  | 'government'
  | 'medical'
  | 'financial'
  | 'technical'
  | 'academic'
  | 'general';

const DOMAIN_KEYWORDS: Record<Exclude<DocumentDomain, 'general'>, string[]> = {
  legal: ['court', 'statute', 'plaintiff', 'defendant', 'jurisdiction', 'criminal', 'probation', 'sentencing'],
  government: [
    'agency',
    'department',
    'appropriations',
    'fiscal year',
    'grant',
    'program',
    'policy',
    'illinois',
    'icjia',
    'criminal justice',
    'information authority',
  ],
  medical: ['patient', 'clinical', 'diagnosis', 'treatment', 'hospital', 'medication', 'pharmaceutical'],
  financial: ['revenue', 'expenditure', 'budget', 'quarterly', 'fiscal', 'balance sheet', 'profit', 'loss'],
  technical: ['algorithm', 'implementation', 'specification', 'architecture', 'protocol', 'api'],
  academic: ['abstract', 'methodology', 'hypothesis', 'conclusion', 'literature review', 'citation'],
};

export const DOMAIN_ALT_TEXT_GUIDANCE: Record<DocumentDomain, string> = {
  legal: 'describe legal documents, seals, signatures, and evidence precisely',
  government: 'describe policy charts and statistics with the key finding stated first',
  medical: 'use clinical terminology, describe anatomical diagrams precisely',
  financial: 'state the key trend or value shown; mention time period if visible',
  technical: 'describe diagrams, flowcharts, and architecture with technical precision',
  academic: 'describe research figures with methodology context',
  general: 'describe what the image conveys to someone who cannot see it',
};

function scoreDomain(text: string, domain: Exclude<DocumentDomain, 'general'>): number {
  const words = DOMAIN_KEYWORDS[domain];
  let hits = 0;
  const lower = text.toLowerCase();
  for (const w of words) {
    if (lower.includes(w.toLowerCase())) hits++;
  }
  return hits;
}

export function detectDomain(title: string | null | undefined, textSample: string): DocumentDomain {
  const hay = `${(title ?? '').trim()} ${(textSample ?? '').trim()}`.slice(0, 4000).toLowerCase();
  if (!hay.trim()) return 'general';

  let best: DocumentDomain = 'general';
  let bestScore = 0;
  const keys: Exclude<DocumentDomain, 'general'>[] = [
    'legal',
    'government',
    'medical',
    'financial',
    'technical',
    'academic',
  ];
  for (const d of keys) {
    const s = scoreDomain(hay, d);
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return bestScore > 0 ? best : 'general';
}
