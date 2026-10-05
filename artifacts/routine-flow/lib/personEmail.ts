const EMAIL_ADDRESS = /^[^\s@]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i;

export const DEFAULT_BACKUP_EMAIL_SUBJECT = 'Your Routine Flow person backup';
export const DEFAULT_BACKUP_EMAIL_MESSAGE = 'Your Routine Flow person backup is attached as a JSON file.';
export const BACKUP_EMAIL_SUBJECT_MAX_LENGTH = 180;
export const BACKUP_EMAIL_MESSAGE_MAX_LENGTH = 2000;

export function isValidEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_ADDRESS.test(trimmed);
}

export function normalizeOptionalEmail(value: string | undefined, label: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return undefined;
  if (!isValidEmailAddress(trimmed)) throw new Error(`Enter a valid ${label} email address.`);
  return trimmed;
}

export function normalizeBackupEmailSubject(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_BACKUP_EMAIL_SUBJECT).replace(/[\r\n]+/g, ' ').trim();
  if (!normalized) return DEFAULT_BACKUP_EMAIL_SUBJECT;
  if (normalized.length > BACKUP_EMAIL_SUBJECT_MAX_LENGTH) {
    throw new Error(`Email subject must be ${BACKUP_EMAIL_SUBJECT_MAX_LENGTH} characters or fewer.`);
  }
  return normalized;
}

export function normalizeBackupEmailMessage(value: string | undefined): string {
  const normalized = value ?? DEFAULT_BACKUP_EMAIL_MESSAGE;
  if (normalized.length > BACKUP_EMAIL_MESSAGE_MAX_LENGTH) {
    throw new Error(`Email message must be ${BACKUP_EMAIL_MESSAGE_MAX_LENGTH} characters or fewer.`);
  }
  return normalized;
}

export function maskEmailAddress(value: string): string {
  const atIndex = value.lastIndexOf('@');
  if (atIndex < 1) return 'configured email';
  return `${value.slice(0, 1)}***${value.slice(atIndex)}`;
}