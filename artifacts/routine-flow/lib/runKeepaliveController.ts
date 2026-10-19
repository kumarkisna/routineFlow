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
  const activeRuns = new Map<string, { title: string; body: string }>();
  const aggregate = () => {
    const runs = [...activeRuns.values()];
    if (runs.length <= 1) return runs[0] ?? { title: 'Routine Flow', body: 'A routine is running.' };
    return {
      title: `${runs.length} routines running`,
      body: runs.map(run => run.title.replace(/^Routine · /, '')).slice(0, 3).join(' · '),
    };
  };

  return {
    isAvailable: !needsAndroidBridge || bridge !== null,
    start(title: string, body: string, runId = 'default') {
      if (!needsAndroidBridge) return true;
      activeRuns.set(runId, { title, body });
      try {
        const summary = aggregate();
        return bridge?.start(summary.title, summary.body) ?? false;
      } catch {
        return false;
      }
    },
    update(title: string, body: string, runId = 'default') {
      if (!needsAndroidBridge) return true;
      activeRuns.set(runId, { title, body });
      try {
        const summary = aggregate();
        return bridge?.update(summary.title, summary.body) ?? false;
      } catch {
        return false;
      }
    },
    stop(runId = 'default') {
      if (!needsAndroidBridge) return true;
      try {
        activeRuns.delete(runId);
        if (activeRuns.size === 0) return bridge?.stop() ?? false;
        const summary = aggregate();
        return bridge?.update(summary.title, summary.body) ?? false;
      } catch {
        return false;
      }
    },
  };
}
