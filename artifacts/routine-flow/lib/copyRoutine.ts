import type { Routine } from '@/types/routines';

export function makeRoutineCopy(source: Routine, existing: Routine[], createId: () => string): Routine {
  const usedIds = new Set([...existing.map((routine) => routine.id), ...source.steps.map((step) => step.id)]);
  function nextId() {
    let id = createId();
    while (usedIds.has(id)) id = createId();
    usedIds.add(id);
    return id;
  }

  return {
    ...source,
    id: nextId(),
    title: `${source.title} (copy)`,
    steps: source.steps.map((step) => ({
      ...step,
      ...(step.additionalDetails ? { additionalDetails: [...step.additionalDetails] } : {}),
      ...(step.detailSpeech ? { detailSpeech: [...step.detailSpeech] } : {}),
      ...(step.detailAttachments ? { detailAttachments: step.detailAttachments.map(group => group.map(file => ({ ...file }))) } : {}),
      ...(step.detailHtml ? { detailHtml: [...step.detailHtml] } : {}),
      id: nextId(),
    })),
    createdAt: new Date().toISOString(),
  };
}