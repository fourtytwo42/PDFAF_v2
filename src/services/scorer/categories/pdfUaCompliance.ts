import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';

export function scorePdfUaCompliance(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];

  // Five markers, 20 points each
  const checks = [
    {
      pass: snap.isTagged,
      wcag: '4.1.1',
      msg: 'Document is not tagged (no structure tree or /MarkInfo/Marked).',
    },
    {
      pass: snap.markInfo?.Marked === true,
      wcag: '4.1.1',
      msg: '/MarkInfo dictionary is missing or /Marked is not true.',
    },
    {
      pass: !!(snap.lang || snap.metadata.language),
      wcag: '3.1.1',
      msg: 'Document language (/Lang) is not specified.',
    },
    {
      pass: !!snap.pdfUaVersion,
      wcag: '4.1.1',
      msg: 'XMP metadata does not declare PDF/UA conformance (pdfuaid:part missing).',
    },
    {
      pass: snap.structureTree !== null,
      wcag: '1.3.1',
      msg: 'Structure tree (/StructTreeRoot) is absent.',
    },
  ];

  let score = 0;
  for (const check of checks) {
    if (check.pass) {
      score += 20;
    } else {
      findings.push({
        category: 'pdf_ua_compliance',
        severity: 'moderate',
        wcag: check.wcag,
        message: check.msg,
      });
    }
  }

  return {
    key: 'pdf_ua_compliance',
    score,
    weight: 0.095,
    applicable: true,
    severity: scoreSeverity(score),
    findings,
  };
}

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}
