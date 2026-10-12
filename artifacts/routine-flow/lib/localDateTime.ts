const pad = (value: number) => String(value).padStart(2, '0');

/** Returns every valid instant for a device-local date and HH:MM pair, in chronological order. */
export function localDateTimeCandidates(date: string, time: string): Date[] {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return [];

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hours, minutes] = timeMatch.slice(1).map(Number);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31
    || hours > 23 || minutes > 59) return [];

  const localSeed = new Date(year, month - 1, day, hours, minutes);
  if (localSeed.getFullYear() !== year || localSeed.getMonth() !== month - 1
    || localSeed.getDate() !== day || localSeed.getHours() !== hours
    || localSeed.getMinutes() !== minutes) return [];

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const offsets = new Set<number>();
  for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(new Date(localSeed.getTime() + deltaHours * 60 * 60 * 1000).getTimezoneOffset());
  }

  return [...offsets]
    .map(offset => new Date(wallClockAsUtc + offset * 60 * 1000))
    .filter(candidate => candidate.getFullYear() === year && candidate.getMonth() === month - 1
      && candidate.getDate() === day && candidate.getHours() === hours && candidate.getMinutes() === minutes)
    .sort((a, b) => a.getTime() - b.getTime());
}

/** Identifies which occurrence of a repeated local clock time an instant represents. */
export function localDateTimeOccurrence(value: Date): 'first' | 'second' | null {
  if (!Number.isFinite(value.getTime())) return null;
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  const candidates = localDateTimeCandidates(date, time);
  if (candidates.length < 2) return null;
  const index = candidates.findIndex(candidate => candidate.getTimezoneOffset() === value.getTimezoneOffset());
  return index === 0 ? 'first' : index === 1 ? 'second' : null;
}

/** Formats a local date/time and identifies the occurrence when the clock time repeats. */
export function formatLocalDateTime(value: Date, options: Intl.DateTimeFormatOptions): string {
  const formatted = value.toLocaleString(undefined, options);
  const occurrence = localDateTimeOccurrence(value);
  return occurrence ? `${formatted} (${occurrence} occurrence)` : formatted;
}
