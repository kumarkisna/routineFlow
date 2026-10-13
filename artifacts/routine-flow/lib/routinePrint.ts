import qrcode from 'qrcode-generator';
import { formatDuration, getStepDetails, getStepSeconds, type Routine } from '@/types/routines';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function qrSvg(url: string): string {
  const code = qrcode(0, 'M');
  code.addData(url, 'Byte');
  code.make();
  return code.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
}

function printableNote(value: string): string {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let result = '';
  let cursor = 0;
  for (const match of value.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const punctuation = rawUrl.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
    const url = punctuation ? rawUrl.slice(0, -punctuation.length) : rawUrl;
    if (!url) continue;
    const start = match.index ?? cursor;
    result += escapeHtml(value.slice(cursor, start)).replace(/\n/g, '<br>');
    let qr = '';
    try {
      qr = `<div class="qr"><span>Scan to open</span>${qrSvg(url)}</div>`;
    } catch {
      qr = '<div class="qr-error">QR code could not be generated for this URL.</div>';
    }
    result += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>${escapeHtml(punctuation)}${qr}`;
    cursor = start + rawUrl.length;
  }
  return `${result}${escapeHtml(value.slice(cursor)).replace(/\n/g, '<br>')}`;
}

export function buildRoutinePdfHtml({
  title,
  kind,
  routines,
  personName,
  personId,
  includeNotes,
}: {
  title: string;
  kind: 'routine' | 'playlist';
  routines: (Routine | undefined)[];
  personName: string;
  personId: string;
  includeNotes: boolean;
}): string {
  if (!personName.trim() || !personId.trim()) throw new Error('The active person details are unavailable.');
  const sections = routines.map((routine, routineIndex) => {
    const routineTitle = routine?.title ?? 'Unavailable routine';
    const subtitle = includeNotes && routine?.subtitle?.trim()
      ? `<div class="note">${printableNote(routine.subtitle.trim())}</div>`
      : '';
    const category = routine?.category?.trim()
      ? `<div class="category">${escapeHtml(routine.category.trim())}</div>`
      : '';
    const steps = (routine?.steps ?? []).map((step, index) => {
      const notes = includeNotes
        ? getStepDetails(step).map(detail => `<div class="note">${printableNote(detail.trim())}</div>`).join('')
        : '';
      const hidden = step.hidden ? '<span class="hidden">Hidden step</span>' : '';
      return `<li><div class="step-title"><strong>${escapeHtml(step.title)}</strong><span class="duration">${escapeHtml(formatDuration(getStepSeconds(step)))}</span>${hidden}</div>${notes}</li>`;
    }).join('');
    const heading = kind === 'playlist' ? `${routineIndex + 1}. ${escapeHtml(routineTitle)}` : escapeHtml(routineTitle);
    return `<section class="routine"><h2>${heading}</h2>${category}${subtitle}${steps ? `<ol class="steps">${steps}</ol>` : '<p class="empty">No saved steps.</p>'}</section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { color: #17202e; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; }
  h1 { font-size: 25px; line-height: 1.2; margin: 0 0 7px; }
  h2 { font-size: 18px; margin: 0 0 10px; }
  .kind { color: #526071; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px; }
  .person-details { color: #667181; font-size: 12px; margin: 0 0 8px; overflow-wrap: anywhere; }
  .routine { border-top: 1px solid #ded9cf; margin-top: 20px; padding-top: 16px; break-inside: avoid; }
  .category { color: #526071; font-size: 12px; margin: -5px 0 10px; }
  .steps { margin: 8px 0 0; padding-left: 25px; }
  .steps li { border-bottom: 1px solid #eee9e0; padding: 10px 0 10px 3px; }
  .step-title { display: flex; align-items: baseline; gap: 8px; }
  .step-title strong { flex: 1; }
  .duration, .hidden { color: #667181; font-size: 11px; }
  .hidden { border: 1px solid #d8d2c8; border-radius: 8px; padding: 1px 5px; }
  .note { color: #526071; margin-top: 6px; white-space: normal; overflow-wrap: anywhere; }
  .note a { color: #a8443b; word-break: break-all; }
  .qr { align-items: center; display: flex; flex-direction: column; gap: 3px; margin: 5px 0 2px; width: 100px; break-inside: avoid; }
  .qr span { color: #667181; font-size: 9px; }
  .qr svg { display: block; height: 86px; width: 86px; }
  .qr-error { color: #9b3e3e; font-size: 10px; margin-top: 4px; }
  .empty { color: #667181; font-style: italic; }
  @media print { .routine { page-break-inside: avoid; } }
</style>
</head>
<body>
  <p class="person-details">Person: ${escapeHtml(personName)} · Profile ID: ${escapeHtml(personId)}</p>
  <h1>${escapeHtml(title)}</h1>
  <div class="kind">${kind === 'playlist' ? 'Playlist' : 'Routine'}</div>
  ${sections}
</body>
</html>`;
}
