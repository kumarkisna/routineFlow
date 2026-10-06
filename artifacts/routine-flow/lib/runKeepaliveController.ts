export type AndroidRunKeepaliveBridge = {
  start: (title: string, body: string) => boolean;
  update: (title: string, body: string) => boolean;
  stop: () => boolean;
};

export function createRunKeepaliveController(
  platform: string,
  bridge: AndroidRunKeepaliveBridge | null,
) {
  const needsAndroidBridge = platform === 'android';

  return {
    isAvailable: !needsAndroidBridge || bridge !== null,
    start(title: string, body: string) {
      if (!needsAndroidBridge) return true;
      try {
        return bridge?.start(title, body) ?? false;
      } catch {
        return false;
      }
    },
    update(title: string, body: string) {
      if (!needsAndroidBridge) return true;
      try {
        return bridge?.update(title, body) ?? false;
      } catch {
        return false;
      }
    },
    stop() {
      if (!needsAndroidBridge) return true;
      try {
        return bridge?.stop() ?? false;
      } catch {
        return false;
      }
    },
  };
}
