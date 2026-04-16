import { describe, expect, it } from 'vitest';
import {
  failedAdobeAnchors,
  parseAdobeAccessibilityReportHtml,
} from '../src/services/compliance/parseAdobeAccreportHtml.js';

const SAMPLE = `<!DOCTYPE HTML>
<html><body>
<dl><dt>Filename: </dt><dd>02_fixture_inaccessible_remediated.pdf</dd></dl>
<h2>Summary</h2>
<ul>
<li>Needs manual check: 2</li>
<li>Passed manually: 0</li>
<li>Failed manually: 0</li>
<li>Skipped: 1</li>
<li>Passed: 26</li>
<li>Failed: 3</li>
</ul>
<h2>Detailed Report</h2>
<table>
<tr><td><a href="http://www.adobe.com/go/acrobat11_accessibility_checker_en#TaggedCont">Tagged content</a></td><td>Failed</td><td>All page content is tagged</td></tr>
<tr><td><a href="http://www.adobe.com/go/acrobat11_accessibility_checker_en#FigAltText">Figures alternate text</a></td><td>Passed</td><td>Figures require alternate text</td></tr>
</table>
</body></html>`;

describe('parseAdobeAccessibilityReportHtml', () => {
  it('parses filename, summary, and rule rows', () => {
    const r = parseAdobeAccessibilityReportHtml(SAMPLE);
    expect(r.filename).toBe('02_fixture_inaccessible_remediated.pdf');
    expect(r.summary).toEqual({
      needsManualCheck: 2,
      passedManually: 0,
      failedManually: 0,
      skipped: 1,
      passed: 26,
      failed: 3,
    });
    expect(r.rows.some(x => x.anchor === 'TaggedCont' && x.status === 'Failed')).toBe(true);
    expect(failedAdobeAnchors(r)).toEqual(['TaggedCont']);
  });
});
