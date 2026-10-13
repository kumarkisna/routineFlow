export type BackgroundCameraPermission = {
  granted: boolean;
  canAskAgain: boolean;
};

export type BackgroundCameraResult<T> = {
  canceled: boolean;
  assets?: T[] | null;
};

export async function capturePersonBackground<T>(
  requestPermission: () => Promise<BackgroundCameraPermission>,
  launchCamera: () => Promise<BackgroundCameraResult<T>>,
  savePhoto: (asset: T) => Promise<void>,
) {
  const permission = await requestPermission();
  if (!permission.granted) {
    throw new Error(
      permission.canAskAgain
        ? 'Allow camera access for Routine Flow to take a background picture, then try again.'
        : 'Camera access is blocked. Enable it for Routine Flow in your device settings, then try again.',
    );
  }

  const result = await launchCamera();
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return 'cancelled' as const;
  await savePhoto(asset);
  return 'saved' as const;
}
