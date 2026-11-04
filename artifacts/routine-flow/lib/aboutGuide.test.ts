import assert from 'node:assert/strict';
import test from 'node:test';
import { aboutGuideSections, buildAboutGuideHtml } from './aboutGuide';

test('printable About guide contains every topic and instruction', () => {
  const html = buildAboutGuideHtml('Routine Flow', 'Copyright Shreshth Bharat Tennis Trust - 2026 - Present');

  for (const section of aboutGuideSections) {
    assert.ok(html.includes(section.title));
    for (const step of section.steps) assert.ok(html.includes(step));
  }
  assert.ok(html.includes('Copyright Shreshth Bharat Tennis Trust - 2026 - Present'));
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
