/** Reject overlapping routine writes instead of letting stale snapshots overwrite one another. */
export function createRoutineWriteGuard() {
  let busy = false;
  return async function runRoutineWrite<T>(write: () => Promise<T>): Promise<T> {
    if (busy) throw new Error('Another routine change is still saving. Please try again.');
    busy = true;
    try {
      return await write();
    } finally {
      busy = false;
    }
  };
}