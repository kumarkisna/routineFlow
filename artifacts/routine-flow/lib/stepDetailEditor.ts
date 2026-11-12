import { detailHtmlToText } from './stepDetailHtml';

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

export function serializeStepDetailEditorSave(platform: 'web' | 'native', webText: string, nativeHtml: string) {
  const html = platform === 'web' ? `<p>${escapeHtml(webText)}</p>` : nativeHtml;
  return { text: detailHtmlToText(html), html };
}
