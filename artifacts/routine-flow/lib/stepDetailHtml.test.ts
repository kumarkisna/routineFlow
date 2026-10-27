import assert from 'node:assert/strict';
import test from 'node:test';
import { detailHtmlToText, sanitizeStepDetailHtml } from './stepDetailHtml';

test('rich headings, lists, emphasis, colors, alignment, and links produce readable plain text', () => {
  const html = [
    '<h2 style="text-align:center;color:#345">Prepare the surface</h2>',
    '<ul><li>Wash it&nbsp;first</li><li><strong>Dry it well</strong></li></ul>',
    '<p style="text-align:right"><em>Use gentle pressure.</em></p>',
    '<p><a href="https://example.com/guide">Open the guide</a></p>',
  ].join('');

  assert.equal(
    detailHtmlToText(html),
    'Prepare the surface\nWash it first\nDry it well\nUse gentle pressure.\nOpen the guide',
  );
});

test('plain text extraction decodes common and numeric entities without retaining markup', () => {
  assert.equal(
    detailHtmlToText('<p>Use &lt; 3 drops &amp; wait &#8212; then continue.</p><br>'),
    'Use < 3 drops & wait — then continue.',
  );
  assert.equal(detailHtmlToText('<p>One</p><p>Two</p>'), 'One\nTwo');
});

test('native rich previews preserve formatting and links while removing executable markup', () => {
  const formatted = '<h2 style="color:#345">A heading</h2><a href="https://example.com">Guide</a>';
  assert.equal(sanitizeStepDetailHtml(formatted), formatted);
  assert.equal(
    sanitizeStepDetailHtml('<p onclick="alert(1)">Safe</p><script>alert(2)</script><a href="javascript:run()">Link</a>'),
    '<p>Safe</p><a>Link</a>',
  );
});

test('rich HTML removes executable tags and unsafe styles while retaining safe formatting', () => {
  assert.equal(
    sanitizeStepDetailHtml('<p style="color:#abc;background-image:url(https://bad)">Keep <strong>this</strong></p><img src=x onerror=alert(1)>'),
    '<p style="color:#abc">Keep <strong>this</strong></p>',
  );
});
