
/**
 * Escapes special characters in a string for use in XML.
 * @param str The string to escape.
 * @returns The escaped string.
 */
export const escapeXml = (str: string | undefined | null): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};
