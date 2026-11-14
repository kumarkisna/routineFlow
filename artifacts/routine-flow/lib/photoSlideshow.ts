export const DEFAULT_STEP_PHOTO_SLIDESHOW_INTERVAL_SECONDS = 5;
export const MIN_STEP_PHOTO_SLIDESHOW_INTERVAL_SECONDS = 1;
export const MAX_STEP_PHOTO_SLIDESHOW_INTERVAL_SECONDS = 30;

export function isValidStepPhotoSlideshowIntervalSeconds(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_STEP_PHOTO_SLIDESHOW_INTERVAL_SECONDS
    && value <= MAX_STEP_PHOTO_SLIDESHOW_INTERVAL_SECONDS;
}
