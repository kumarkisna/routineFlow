import type { HistorySkillRating } from './progressHistory';

export type SkillRatingReportInput = {
  personName: string;
  personId: string;
  routineTitle: string;
  dateTime: string;
  isRunTime: boolean;
  ratings: readonly HistorySkillRating[];
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function formatSkillRatingDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('The run date and time is invalid.');
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function buildSkillRatingReportHtml(input: SkillRatingReportInput): string {
  if (!input.personName.trim() || !input.personId.trim()) {
    throw new Error('The active person details are unavailable.');
  }
  const routineTitle = input.routineTitle.trim();
  if (!routineTitle || routineTitle.length > 200) throw new Error('The routine name is invalid.');
  if (!Array.isArray(input.ratings) || input.ratings.length === 0) {
    throw new Error('There are no skill ratings to include in this PDF.');
  }
  if (input.ratings.some(item => !item.skillName.trim()
    || !Number.isInteger(item.rating) || item.rating < 1 || item.rating > 10
    || (item.note !== undefined && typeof item.note !== 'string'))) {
    throw new Error('The saved skill ratings could not be read.');
  }

  const date = new Date(input.dateTime);
  if (!Number.isFinite(date.getTime())) throw new Error('The run date and time is invalid.');
  const dateTime = formatSkillRatingDateTime(input.dateTime);
  const orderedRatings = [...input.ratings].sort((a, b) =>
    (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER)
    || a.skillName.localeCompare(b.skillName));
  const rows = orderedRatings.map((item, index) => `
    <tr>
      <td class="number">${index + 1}</td>
      <th scope="row">${escapeHtml(item.skillName)}</th>
      <td class="score">${item.rating}/10</td>
      <td class="note">${escapeHtml(item.note?.trim() || 'No note recorded.')}</td>
    </tr>`).join('');
  const dateLabel = input.isRunTime ? 'Run date and time' : 'Rating recorded';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(routineTitle)} — Skill ratings</title>
  <style>
    * { box-sizing: border-box; }
    body { max-width: 780px; margin: 0 auto; padding: 34px; color: #1e2d28; font: 15px/1.55 Arial, sans-serif; }
    .eyebrow { margin: 0 0 8px; color: #537267; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .person-details { margin: 0 0 8px; color: #63736d; font-size: 12px; }
    h1 { margin: 0; font-size: 29px; line-height: 1.2; }
    .metadata { margin: 22px 0 26px; padding: 14px 16px; border: 1px solid #d9e2dc; border-radius: 10px; background: #f6f8f5; }
    .metadata dt { color: #63736d; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .metadata dd { margin: 3px 0 0; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #e9f2ec; }
    th, td { padding: 12px 10px; border-bottom: 1px solid #d9e2dc; text-align: left; vertical-align: top; }
    thead th { color: #385b4d; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
    td.number { width: 42px; color: #63736d; text-align: center; }
    td.score { width: 74px; color: #2f624e; font-weight: 700; white-space: nowrap; }
    td.note { overflow-wrap: anywhere; }
    tbody tr { break-inside: avoid; }
    .footer { margin-top: 26px; color: #63736d; font-size: 11px; }
    @page { margin: 18mm; }
    @media print {
      body { max-width: none; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">Routine Flow · Skill reflection</p>
    <p class="person-details">Person: ${escapeHtml(input.personName)} · Profile ID: ${escapeHtml(input.personId)}</p>
    <h1>${escapeHtml(routineTitle)}</h1>
    <dl class="metadata">
      <dt>${dateLabel}</dt>
      <dd><time datetime="${date.toISOString()}">${escapeHtml(dateTime)}</time></dd>
    </dl>
  </header>
  <main>
    <table>
      <thead><tr><th scope="col">Order</th><th scope="col">Skill</th><th scope="col">Rating</th><th scope="col">Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="footer">Ratings are shown in the order they were presented after this routine run.</p>
  </main>
</body>
</html>`;
}
