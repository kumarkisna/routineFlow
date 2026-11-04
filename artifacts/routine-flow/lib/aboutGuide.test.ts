import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aboutGuideSections,
  buildAboutGuideHtml,
  openAboutGuidePrintWindow,
  type AboutGuidePrintWindow,
} from './aboutGuide';

test('printable About guide contains every topic and instruction', () => {
  const html = buildAboutGuideHtml('Routine Flow', 'Copyright Shreshth Bharat Tennis Trust - 2026 - Present');

  for (const section of aboutGuideSections) {
    assert.ok(html.includes(section.title));
    for (const step of section.steps) assert.ok(html.includes(step));
  }
  assert.ok(html.includes('Copyright Shreshth Bharat Tennis Trust - 2026 - Present'));
  assert.ok(html.includes('break-inside: avoid'));
  assert.ok(html.includes('@page { margin: 18mm; }'));
  assert.ok(html.includes('@media print'));
});

test('printable About guide escapes app name and copyright markup', () => {
  const html = buildAboutGuideHtml('<Routine Flow>', 'Copyright <Trust> & Co.');

  assert.ok(html.includes('&lt;Routine Flow&gt;'));
  assert.ok(html.includes('Copyright &lt;Trust&gt; &amp; Co.'));
  assert.ok(!html.includes('<Routine Flow>'));
});

test('printable About guide requires a name and copyright', () => {
  assert.throws(() => buildAboutGuideHtml('', 'Copyright'), /required/);
  assert.throws(() => buildAboutGuideHtml('Routine Flow', '  '), /required/);
});

test('browser print opens the complete guide and closes its window after printing', () => {
  const html = buildAboutGuideHtml('Routine Flow', 'Copyright Shreshth Bharat Tennis Trust - 2026 - Present');
  const calls = { opened: 0, written: '', documentClosed: 0, focused: 0, printed: 0, closed: 0 };
  const printWindow: AboutGuidePrintWindow = {
    document: {
      open: () => { calls.opened += 1; },
      write: value => { calls.written = value; },
      close: () => { calls.documentClosed += 1; },
    },
    onafterprint: null,
    focus: () => { calls.focused += 1; },
    print: () => { calls.printed += 1; },
    close: () => { calls.closed += 1; },
  };

  openAboutGuidePrintWindow(html, () => printWindow);

  assert.equal(calls.opened, 1);
  assert.equal(calls.written, html);
  assert.equal(calls.documentClosed, 1);
  assert.equal(calls.focused, 1);
  assert.equal(calls.printed, 1);
  assert.equal(calls.closed, 0);
  printWindow.onafterprint?.();
  assert.equal(calls.closed, 1);
});

test('blocked browser popup gives an actionable message', () => {
  assert.throws(
    () => openAboutGuidePrintWindow('<html></html>', () => null),
    /Allow pop-ups in your browser to print the instructions/,
  );
});
