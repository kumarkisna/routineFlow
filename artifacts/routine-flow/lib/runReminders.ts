export type RunReminderSettings = {
  stepCompletion: boolean;
  routineCompletion: boolean;
};

export type RunReminderRequest = {
  kind: 'step' | 'routine';
  title: string;
  body: string;
  date: Date;
};

export function buildRunReminderRequests(input: {
  routineTitle: string;
  steps: readonly { title: string }[];
  activeIndex: number;
  stepEndsAt: number | null;
  now: number;
  settings: RunReminderSettings;
}): RunReminderRequest[] {
  const { routineTitle, steps, activeIndex, stepEndsAt, now, settings } = input;
  if (
    !Number.isFinite(stepEndsAt) ||
    stepEndsAt === null ||
    stepEndsAt <= now ||
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= steps.length
  ) {
    return [];
  }

  const isLastStep = activeIndex === steps.length - 1;
  const date = new Date(stepEndsAt);
  const requests: RunReminderRequest[] = [];

  if (settings.stepCompletion) {
    requests.push({
      kind: 'step',
      title: 'Step complete',
      body: isLastStep ? `${routineTitle} is complete.` : `${steps[activeIndex].title} is complete.`,
      date,
    });
  }

  if (isLastStep && settings.routineCompletion) {
    requests.push({
      kind: 'routine',
      title: 'Routine complete',
      body: `${routineTitle} is complete.`,
      date,
    });
  }

  return requests;
}

export type ReminderPermissionResponse = {
  granted: boolean;
  canAskAgain?: boolean;
};

export async function requestRunReminderPermission(api: {
  getPermissionsAsync: () => Promise<ReminderPermissionResponse>;
  requestPermissionsAsync: () => Promise<ReminderPermissionResponse>;
}): Promise<ReminderPermissionResponse> {
  let permission = await api.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain !== false) {
    permission = await api.requestPermissionsAsync();
  }
  return permission;
}
