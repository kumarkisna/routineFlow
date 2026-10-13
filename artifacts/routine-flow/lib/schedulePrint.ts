import { formatDuration, getStepDetails, getStepSeconds, type Routine } from '@/types/routines';
import { formatLocalDateTime } from './localDateTime';

export type SchedulePrintInput = {
  personName: string;
  personId: string;
  scheduledAt: string;
  title: string;
  targetType: 'routine' | 'playlist';
  routines: readonly Pick<Routine, 'title' | 'steps'>[];
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

export function buildSchedulePrintHtml(input: SchedulePrintInput): string {
  if (!input.personName.trim() || !input.personId.trim()) {
    throw new Error('The active person details are unavailable.');
  }
  const scheduledDate = new Date(input.scheduledAt);
  if (!Number.isFinite(scheduledDate.getTime())) {
    throw new Error('The scheduled date is invalid.');
  }
  if (!input.routines.length) {
    throw new Error('This schedule has no visible routines to print.');
  }
  if (input.routines.some(routine => !routine.steps.some(step => !step.hidden))) {
    throw new Error('Every routine needs at least one visible step to print.');
  }

  const dateLabel = formatLocalDateTime(scheduledDate, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const routineSections = input.routines.map((routine, routineIndex) => {
    const heading = input.targetType === 'playlist'
      ? `<p class="sequence">Routine ${routineIndex + 1} of ${input.routines.length}</p><h2>${escapeHtml(routine.title)}</h2>`
      : '';
    const steps = routine.steps
      .filter(step => !step.hidden)
      .map((step, stepIndex) => {
        const details = getStepDetails(step)
          .map(detail => `<p class="detail">${escapeHtml(detail)}</p>`)
          .join('');
        return `<li class="step"><span class="step-number">${stepIndex + 1}</span><div class="step-copy"><div class="step-title-row"><h3>${escapeHtml(step.title)}</h3><span class="duration">${escapeHtml(formatDuration(getStepSeconds(step)))}</span></div>${details}</div></li>`;
      })
      .join('');

    return `<section class="routine">${heading}<ol class="steps">${steps}</ol></section>`;
  }).join('');

  const scheduleLabel = input.targetType === 'playlist' ? 'Scheduled playlist' : 'Scheduled routine';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)} — Routine Flow</title>
  <style>
    * { box-sizing: border-box; }
    body { max-width: 780px; margin: 0 auto; padding: 34px; color: #1e2d28; font: 16px/1.5 Arial, sans-serif; }
    .eyebrow, .sequence { margin: 0 0 6px; color: #537267; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .person-details { margin: 0 0 8px; color: #63736d; font-size: 12px; }
    h1 { margin: 0; font-size: 30px; line-height: 1.2; }
    .metadata { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 22px 0 26px; padding: 16px 0; border-top: 1px solid #d9e2dc; border-bottom: 1px solid #d9e2dc; }
    .metadata div { min-width: 190px; }
    dt { color: #63736d; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    dd { margin: 2px 0 0; font-weight: 600; }
    .routine { margin-top: 24px; break-inside: avoid; }
    .routine + .routine { border-top: 1px solid #d9e2dc; padding-top: 20px; }
    h2 { margin: 0 0 14px; font-size: 21px; }
    .steps { margin: 0; padding: 0; list-style: none; }
    .step { display: flex; gap: 12px; align-items: flex-start; }
    .step + .step { margin-top: 18px; }
    .step-number { display: grid; width: 26px; height: 26px; flex: 0 0 26px; place-items: center; border-radius: 50%; background: #e9f2ec; color: #2f624e; font-size: 12px; font-weight: 700; }
    .step-copy { min-width: 0; flex: 1; }
    .step-title-row { display: flex; justify-content: space-between; gap: 12px; }
    h3 { margin: 1px 0 0; font-size: 16px; }
    .duration { flex: 0 0 auto; color: #63736d; font-size: 13px; font-weight: 600; }
    .detail { margin: 5px 0 0; color: #53645d; font-size: 14px; }
    @page { margin: 18mm; }
    @media print {
      body { max-width: none; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .routine { break-inside: auto; }
      .step { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">${scheduleLabel}</p>
    <p class="person-details">Person: ${escapeHtml(input.personName)} · Profile ID: ${escapeHtml(input.personId)}</p>
    <h1>${escapeHtml(input.title)}</h1>
    <dl class="metadata">
      <div><dt>Date and time</dt><dd><time datetime="${scheduledDate.toISOString()}">${escapeHtml(dateLabel)}</time></dd></div>
    </dl>
  </header>
  <main>${routineSections}</main>
</body>
</html>`;
}