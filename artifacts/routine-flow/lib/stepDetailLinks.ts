export type StepDetailSegment = { text: string; url?: string };
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;

export function splitStepDetails(details: string): StepDetailSegment[] {
  const segments: StepDetailSegment[] = [];
  let lastIndex = 0;

  for (const match of details.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ text: details.slice(lastIndex, index) });

    const matched = match[0];
    const text = matched.replace(/[.,!?;:)\]}]+$/, '');
    const trailing = matched.slice(text.length);
    try {
      const parsed = new URL(text.toLowerCase().startsWith('www.') ? `https://${text}` : text);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        segments.push({ text: matched });
      } else {
        segments.push({ text, url: parsed.href });
        if (trailing) segments.push({ text: trailing });
      }
    } catch {
      segments.push({ text: matched });
    }
    lastIndex = index + matched.length;
  }

  if (lastIndex < details.length) segments.push({ text: details.slice(lastIndex) });
  return segments;
}