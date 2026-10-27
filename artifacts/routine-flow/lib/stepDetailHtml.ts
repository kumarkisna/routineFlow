const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntities(text: string) {
  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const isHex = name[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }
      return entity;
    }
    return HTML_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

export function detailHtmlToText(html: string) {
  if (!/<\/?[a-z][\w:-]*(?:\s[^<>]*)?\s*\/?>/i.test(html)) return html;

  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:p|div|li|h[1-6]|blockquote|pre|tr|hr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function sanitizeStepDetailHtml(html: string) {
  const allowedTags = new Set([
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'i', 'li',
    'ol', 'p', 'pre', 's', 'span', 'strike', 'strong', 'u', 'ul',
  ]);
  const safeHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*\/?>/gi, '');

  return safeHtml.replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (tag, rawName: string, attributes: string) => {
    const name = rawName.toLowerCase();
    if (!allowedTags.has(name)) return '';
    if (tag.startsWith('</')) return `</${name}>`;
    const styleMatch = attributes.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawStyle = styleMatch?.[1] ?? styleMatch?.[2] ?? styleMatch?.[3] ?? '';
    const safeStyles = rawStyle.split(';').flatMap(declaration => {
      const separator = declaration.indexOf(':');
      if (separator < 1) return [];
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim().toLowerCase();
      const colorValue = /^(#[\da-f]{3,8}|[a-z]{1,20}|rgba?\([\d.,%\s]+\))$/i;
      const allowedValue = property === 'text-align'
        ? /^(left|center|right|justify)$/.test(value)
        : property === 'font-size'
          ? /^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/.test(value)
          : property === 'font-weight'
            ? /^(normal|bold|[1-9]00)$/.test(value)
            : property === 'font-style'
              ? /^(normal|italic|oblique)$/.test(value)
              : property === 'text-decoration'
                ? /^(none|underline|line-through|overline)$/.test(value)
                : ['color', 'background-color'].includes(property) && colorValue.test(value);
      return allowedValue ? [`${property}:${value}`] : [];
    });
    const styleAttribute = safeStyles.length ? ` style="${safeStyles.join(';')}"` : '';
    if (name !== 'a') return `<${name}${styleAttribute}>`;

    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '';
    if (!/^(https?:|mailto:)/i.test(href.trim())) return `<a${styleAttribute}>`;
    const safeHref = href.trim().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<a href="${safeHref}"${styleAttribute}>`;
  });
}

export function plainTextToDetailHtml(text: string) {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const lines = text.trim().split(/\r?\n/).map(line => escapeHtml(line));
  return lines.some(line => line.trim()) ? `<p>${lines.join('<br>')}</p>` : '';
}

export function resolveReflectionTemplateHtml(html?: string, text?: string) {
  const source = html?.trim() ? html : plainTextToDetailHtml(text ?? '');
  const sanitized = sanitizeStepDetailHtml(source);
  if (detailHtmlToText(sanitized).trim()) return sanitized;
  if (html?.trim() && text?.trim()) {
    const plainFallback = sanitizeStepDetailHtml(plainTextToDetailHtml(text));
    if (detailHtmlToText(plainFallback).trim()) return plainFallback;
  }
  return undefined;
}
