import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import {
  PDF_UA_LIST_VIOLATION_FAIL_THRESHOLD,
  PDF_UA_ORPHAN_MCID_FAIL_THRESHOLD,
  PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD,
} from '../../../config.js';
import { normalizedTableSignals } from '../tableRegularityHeuristics.js';

export function scorePdfUaCompliance(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];
  const stage3 = snap.detectionProfile;

  const checks: { pass: boolean; wcag: string; msg: string }[] = [
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
      pass:
        snap.structureTree !== null ||
        (snap.isTagged && snap.headings.length > 0),
      wcag: '1.3.1',
      msg: 'Structure tree (/StructTreeRoot) is absent.',
    },
  ];

  const aa = stage3?.annotationSignals ?? snap.annotationAccessibility;
  if (snap.structureTree !== null && aa) {
    const n =
      (aa.linkAnnotationsMissingStructure ?? 0) + (aa.nonLinkAnnotationsMissingStructure ?? 0);
    // Ignore tiny residue (Acrobat vs pikepdf noise); tighten toward Acrobat "Tagged annotations".
    if (n > 4) {
      checks.push({
        pass: false,
        wcag: '1.3.1',
        msg: `${n} visible annotation(s) are not correctly associated with the structure tree (tagged annotations).`,
      });
    }
  }

  const lsa = stage3?.listSignals ?? snap.listStructureAudit;
  if (snap.isTagged && snap.structureTree !== null && lsa) {
    const violations =
      (lsa.listItemMisplacedCount ?? 0) +
      (lsa.lblBodyMisplacedCount ?? 0) +
      (lsa.listsWithoutItems ?? 0);
    if (violations >= PDF_UA_LIST_VIOLATION_FAIL_THRESHOLD) {
      checks.push({
        pass: false,
        wcag: '1.3.1',
        msg: `List structure audit reports ${violations} Acrobat-style list issue(s) (misplaced list items / Lbl+LBody / lists without items; counts: LI↔L=${lsa.listItemMisplacedCount ?? 0}, Lbl+LBody=${lsa.lblBodyMisplacedCount ?? 0}, L without LI=${lsa.listsWithoutItems ?? 0}).`,
      });
    }
  }

  const pdfUaSignals = stage3?.pdfUaSignals ?? snap.taggedContentAudit;
  if (snap.structureTree !== null && pdfUaSignals) {
    const orphans = pdfUaSignals.orphanMcidCount ?? 0;
    if (orphans >= PDF_UA_ORPHAN_MCID_FAIL_THRESHOLD) {
      checks.push({
        pass: false,
        wcag: '1.3.1',
        msg: `${orphans} marked-content MCID(s) appear outside the structure tree (Acrobat "Tagged content" / orphan MCIDs).`,
      });
    }
    const paths = pdfUaSignals.suspectedPathPaintOutsideMc ?? 0;
    if (paths > PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD) {
      checks.push({
        pass: false,
        wcag: '1.3.1',
        msg: `Tagged content audit suggests ${paths} path paint operator(s) outside marked-content blocks (heuristic; Acrobat may flag untagged content).`,
      });
    }
  }

  const tableSignals = stage3?.tableSignals;
  if (snap.structureTree !== null && tableSignals) {
    const effectiveTableSignals = normalizedTableSignals(snap, tableSignals);
    if (tableSignals.directCellUnderTableCount > 0) {
      checks.push({
        pass: false,
        wcag: '1.3.1',
        msg: `${tableSignals.directCellUnderTableCount} table cell(s) appear directly under /Table instead of under /TR rows.`,
      });
    }
    const strongIrregularCount = effectiveTableSignals.stronglyIrregularTableCount;
    if (strongIrregularCount > 0) {
      checks.push({
        pass: false,
        wcag: '1.3.1',
        msg: `${strongIrregularCount} table(s) show strongly irregular row structure likely to break table semantics.`,
      });
    }
  }

  let score = 0;
  const per = 100 / checks.length;
  for (const check of checks) {
    if (check.pass) {
      score += per;
    } else {
      findings.push({
        category: 'pdf_ua_compliance',
        severity: 'moderate',
        wcag: check.wcag,
        message: check.msg,
      });
    }
  }
  score = Math.round(score);

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
