import type { RoutineStep, StepDetailAttachment } from '../types/routines';

export type StepDetailDraft = {
  description: string;
  additionalDetails: string[];
  /** Index 0 belongs to description; each following entry belongs to the additional detail at that index. */
  detailSpeech: boolean[];
  detailAttachments: StepDetailAttachment[][];
  detailHtml: string[];
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

export function removeAdditionalStepDetail(draft: StepDetailDraft, index: number): StepDetailDraft {
  if (!Number.isInteger(index) || index < 0 || index >= draft.additionalDetails.length) return draft;
  return {
    ...draft,
    additionalDetails: draft.additionalDetails.filter((_, detailIndex) => detailIndex !== index),
    detailSpeech: draft.detailSpeech.filter((_, speechIndex) => speechIndex !== index + 1),
    detailAttachments: draft.detailAttachments.filter((_, detailIndex) => detailIndex !== index + 1),
    detailHtml: draft.detailHtml.filter((_, detailIndex) => detailIndex !== index + 1),
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
