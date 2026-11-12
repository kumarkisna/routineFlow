import { detailHtmlToText, sanitizeStepDetailHtml } from './stepDetailHtml';

export type StepDetailEditorDraft = { sourceKey: string; html: string; text: string };

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

export function openStepDetailEditorDraft(
  label: string,
  value: string,
  html: string,
  retained: StepDetailEditorDraft | null,
): StepDetailEditorDraft {
  const sourceKey = JSON.stringify([label, value, html]);
  if (retained?.sourceKey === sourceKey) return retained;
  return {
    sourceKey,
    html: html ? sanitizeStepDetailHtml(html) : `<p>${escapeHtml(value)}</p>`,
    text: value,
  };
}

export function serializeStepDetailEditorSave(platform: 'web' | 'native', webText: string, nativeHtml: string) {
  const html = platform === 'web' ? `<p>${escapeHtml(webText)}</p>` : sanitizeStepDetailHtml(nativeHtml);
  return { text: detailHtmlToText(html), html };
}
