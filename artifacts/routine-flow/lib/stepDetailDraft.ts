import type { RoutineStep } from '../types/routines';

export type StepDetailDraft = {
  description: string;
  additionalDetails: string[];
  /** Index 0 belongs to description; each following entry belongs to the additional detail at that index. */
  detailSpeech: boolean[];
};

export function createEmptyStepDetailDraft(): StepDetailDraft {
  return { description: '', additionalDetails: [], detailSpeech: [true] };
}

export function createStepDetailDraft(
  step: Pick<RoutineStep, 'description' | 'additionalDetails' | 'detailSpeech' | 'speakDetails'>,
): StepDetailDraft {
  const additionalDetails = [...(step.additionalDetails ?? [])];
  const legacySpeechDefault = step.speakDetails !== false;
  return {
    description: step.description ?? '',
    additionalDetails,
    detailSpeech: [step.description, ...additionalDetails]
      .map((_, index) => step.detailSpeech?.[index] ?? legacySpeechDefault),
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
  };
}

export function buildStepDetailFields(draft: StepDetailDraft) {
  const additionalDetailsWithSpeech = draft.additionalDetails.flatMap((detail, index) => {
    const text = detail.trim();
    return text ? [{ text, speak: draft.detailSpeech[index + 1] ?? true }] : [];
  });
  return {
    description: draft.description.trim(),
    additionalDetails: additionalDetailsWithSpeech.map(detail => detail.text),
    detailSpeech: [
      draft.detailSpeech[0] ?? true,
      ...additionalDetailsWithSpeech.map(detail => detail.speak),
    ],
  };
}
