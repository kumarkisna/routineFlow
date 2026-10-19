export type ActiveRunSession = {
  sessionId: string;
  routineId: string;
  title: string;
  activeStep: number;
  totalSteps: number;
  remainingSeconds: number;
  status: 'ready' | 'announcing' | 'running' | 'paused' | 'finished';
};

const sessions = new Map<string, ActiveRunSession>();
const listeners = new Set<() => void>();
let snapshot: ActiveRunSession[] = [];

function publish() {
  snapshot = [...sessions.values()].filter(session => session.status !== 'finished');
  for (const listener of listeners) listener();
}

export function getActiveRunSessions() {
  return snapshot;
}

export function subscribeActiveRunSessions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerActiveRunSession(session: ActiveRunSession) {
  sessions.set(session.sessionId, session);
  publish();
}

export function updateActiveRunSession(sessionId: string, patch: Partial<ActiveRunSession>) {
  const current = sessions.get(sessionId);
  if (!current) return;
  sessions.set(sessionId, { ...current, ...patch });
  publish();
}

export function removeActiveRunSession(sessionId: string) {
  if (sessions.delete(sessionId)) publish();
}
