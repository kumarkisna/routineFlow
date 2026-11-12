import type { RoutineStep, StepDetailAttachment } from '../types/routines';

export type StepDetailDraft = {
  description: string;
  additionalDetails: string[];
  /** Index 0 belongs to description; each following entry belongs to the additional detail at that index. */
  detailSpeech: boolean[];
  detailAttachments: StepDetailAttachment[][];
  detailHtml: string[];
  removedAdditionalDetails?: Array<{
    index: number;
    text: string;
    speak: boolean;
    attachments: StepDetailAttachment[];
    html: string;
  }>;
};

export function createEmptyStepDetailDraft(): StepDetailDraft {
  return { description: '', additionalDetails: [], detailSpeech: [true], detailAttachments: [[]], detailHtml: [''] };
}

export function createStepDetailDraft(
  step: Pick<RoutineStep, 'description' | 'additionalDetails' | 'detailSpeech' | 'speakDetails' | 'detailAttachments' | 'detailHtml'>,
): StepDetailDraft {
  const additionalDetails = [...(step.additionalDetails ?? [])];
  const legacySpeechDefault = step.speakDetails !== false;
  return {
    description: step.description ?? '',
    additionalDetails,
    detailSpeech: [step.description, ...additionalDetails]
      .map((_, index) => step.detailSpeech?.[index] ?? legacySpeechDefault),
    detailAttachments: Array.from({ length: 1 + additionalDetails.length }, (_, index) => [...(step.detailAttachments?.[index] ?? [])]),
    detailHtml: Array.from({ length: 1 + additionalDetails.length }, (_, index) => step.detailHtml?.[index] ?? ''),
  };
}

export function setStepDetailSpeech(draft: StepDetailDraft, index: number, speak: boolean): StepDetailDraft {
  const detailSpeech = [...draft.detailSpeech];
  detailSpeech[index] = speak;
  return { ...draft, detailSpeech };
}

export function addAdditionalStepDetail(draft: StepDetailDraft): StepDetailDraft {
  return {
    ...draft,
    additionalDetails: [...draft.additionalDetails, ''],
    detailSpeech: [...draft.detailSpeech, true],
    detailAttachments: [...draft.detailAttachments, []],
    detailHtml: [...draft.detailHtml, ''],
  };
}

export function updateAdditionalStepDetail(
  draft: StepDetailDraft,
  index: number,
  text: string,
): StepDetailDraft {
  return {
    ...draft,
    additionalDetails: draft.additionalDetails.map((detail, detailIndex) => (
      detailIndex === index ? text : detail
    )),
  };
}

export function moveAdditionalStepDetail(
  draft: StepDetailDraft,
  index: number,
  direction: -1 | 1,
): StepDetailDraft {
  const destination = index + direction;
  if (!Number.isInteger(index) || index < 0 || index >= draft.additionalDetails.length
    || destination < 0 || destination >= draft.additionalDetails.length) return draft;

  const move = <T,>(items: T[], offset = 0) => {
    const reordered = [...items];
    [reordered[index + offset], reordered[destination + offset]] =
      [reordered[destination + offset], reordered[index + offset]];
    return reordered;
  };

  return {
    ...draft,
    additionalDetails: move(draft.additionalDetails),
    detailSpeech: move(draft.detailSpeech, 1),
    detailAttachments: move(draft.detailAttachments, 1),
    detailHtml: move(draft.detailHtml, 1),
  };
}

export function removeAdditionalStepDetail(draft: StepDetailDraft, index: number): StepDetailDraft {
  if (!Number.isInteger(index) || index < 0 || index >= draft.additionalDetails.length) return draft;
  return {
    ...draft,
    removedAdditionalDetails: [...(draft.removedAdditionalDetails ?? []), {
      index,
      text: draft.additionalDetails[index],
      speak: draft.detailSpeech[index + 1] ?? true,
      attachments: [...(draft.detailAttachments[index + 1] ?? [])],
      html: draft.detailHtml[index + 1] ?? '',
    }],
    additionalDetails: draft.additionalDetails.filter((_, detailIndex) => detailIndex !== index),
    detailSpeech: draft.detailSpeech.filter((_, speechIndex) => speechIndex !== index + 1),
    detailAttachments: draft.detailAttachments.filter((_, detailIndex) => detailIndex !== index + 1),
    detailHtml: draft.detailHtml.filter((_, detailIndex) => detailIndex !== index + 1),
  };
}

export function undoRemoveAdditionalStepDetail(draft: StepDetailDraft): StepDetailDraft {
  const removals = draft.removedAdditionalDetails ?? [];
  const removed = removals[removals.length - 1];
  if (!removed) return draft;

  const index = Math.max(0, Math.min(removed.index, draft.additionalDetails.length));
  const additionalDetails = [...draft.additionalDetails];
  const detailSpeech = [...draft.detailSpeech];
  const detailAttachments = [...draft.detailAttachments];
  const detailHtml = [...draft.detailHtml];
  additionalDetails.splice(index, 0, removed.text);
  detailSpeech.splice(index + 1, 0, removed.speak);
  detailAttachments.splice(index + 1, 0, [...removed.attachments]);
  detailHtml.splice(index + 1, 0, removed.html);

  const { removedAdditionalDetails: _removedAdditionalDetails, ...rest } = draft;
  return {
    ...rest,
    additionalDetails,
    detailSpeech,
    detailAttachments,
    detailHtml,
    ...(removals.length > 1 ? { removedAdditionalDetails: removals.slice(0, -1) } : {}),
  };
}

export function buildStepDetailFields(draft: StepDetailDraft) {
  const additionalDetailsWithSpeech = draft.additionalDetails.flatMap((detail, index) => {
    const text = detail.trim();
    const attachments = draft.detailAttachments[index + 1] ?? [];
    const html = draft.detailHtml[index + 1] ?? '';
    return text || attachments.length || html ? [{ text, speak: draft.detailSpeech[index + 1] ?? true, attachments, html }] : [];
  });
  return {
    description: draft.description.trim(),
    additionalDetails: additionalDetailsWithSpeech.map(detail => detail.text),
    detailSpeech: [
      draft.detailSpeech[0] ?? true,
      ...additionalDetailsWithSpeech.map(detail => detail.speak),
    ],
    detailAttachments: [
      [...(draft.detailAttachments[0] ?? [])],
      ...additionalDetailsWithSpeech.map(detail => [...detail.attachments]),
    ],
    detailHtml: [
      draft.detailHtml[0] ?? '',
      ...additionalDetailsWithSpeech.map(detail => detail.html),
    ],
  };
}

export function setStepDetailAttachments(draft: StepDetailDraft, index: number, attachments: StepDetailAttachment[]): StepDetailDraft {
  const detailAttachments = [...draft.detailAttachments];
  detailAttachments[index] = attachments;
  return { ...draft, detailAttachments };
}

export function addStepDetailAttachment(draft: StepDetailDraft, index: number, attachment: StepDetailAttachment): StepDetailDraft {
  const detailAttachments = [...draft.detailAttachments];
  detailAttachments[index] = [...(detailAttachments[index] ?? []), attachment];
  return { ...draft, detailAttachments };
}

export function removeStepDetailAttachment(draft: StepDetailDraft, index: number, attachmentId: string): StepDetailDraft {
  const detailAttachments = [...draft.detailAttachments];
  detailAttachments[index] = (detailAttachments[index] ?? []).filter(attachment => attachment.id !== attachmentId);
  return { ...draft, detailAttachments };
}

export function setStepDetailHtml(draft: StepDetailDraft, index: number, html: string): StepDetailDraft {
  const detailHtml = [...draft.detailHtml];
  detailHtml[index] = html;
  return { ...draft, detailHtml };
}
