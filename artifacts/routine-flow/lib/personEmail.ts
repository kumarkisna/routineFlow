const EMAIL_ADDRESS = /^[^\s@]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i;

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

export function maskEmailAddress(value: string): string {
  const atIndex = value.lastIndexOf('@');
  if (atIndex < 1) return 'configured email';
  return `${value.slice(0, 1)}***${value.slice(atIndex)}`;
}