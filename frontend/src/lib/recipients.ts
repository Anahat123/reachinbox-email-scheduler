import Papa from 'papaparse';

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
const EMAIL_IN_TEXT_RE = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}/g;

export const isValidEmail = (value: string) => EMAIL_RE.test(value.trim());

export function uniqueEmails(values: string[]) {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(isValidEmail))];
}

/**
 * Pulls every email address out of a CSV or plain-text file. Works whether the
 * CSV has an "email" column, several columns, or no header at all.
 */
export async function parseLeadsFile(file: File): Promise<string[]> {
  const text = await file.text();
  if (!/\.csv$/i.test(file.name)) return uniqueEmails(text.match(EMAIL_IN_TEXT_RE) ?? []);

  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const cells = data.flat().flatMap((cell) => String(cell).match(EMAIL_IN_TEXT_RE) ?? []);
  return uniqueEmails(cells);
}

/** Splits a pasted string ("a@x.com, b@y.com; c@z.com") into candidate addresses. */
export const splitTyped = (value: string) => value.split(/[\s,;]+/).filter(Boolean);
