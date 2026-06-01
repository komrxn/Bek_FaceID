/**
 * Russian typography polish.
 *
 * - "Straight" quotes → «ёлочки»
 * - Hyphen between words with spaces → em-dash with hair spaces
 * - Non-breaking space after single-letter prepositions (в, с, у, о, к, а, и)
 *   and before short words like "г.", "руб."
 *
 * Apply via `ru("текст ...")` on any user-visible string assembled from
 * literals. Don't apply to API-supplied strings (already styled by the user).
 */

const NBSP = " ";
const HAIR = " ";
const EM_DASH = "—";

const PREPOSITIONS = ["в", "с", "у", "о", "к", "а", "и", "я", "В", "С", "У", "О", "К", "А", "И", "Я"];

function fixQuotes(s: string): string {
  let result = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === '"') {
      result += depth === 0 ? "«" : "»";
      depth = (depth + 1) % 2;
    } else {
      result += ch;
    }
  }
  return result;
}

function fixDashes(s: string): string {
  return s.replace(/ - /g, `${HAIR}${EM_DASH}${HAIR}`);
}

function fixPrepositions(s: string): string {
  let result = s;
  for (const p of PREPOSITIONS) {
    // word-boundary-safe replacement of " <p> " with " <p> "
    const re = new RegExp(`(^|\\s)${p}\\s`, "g");
    result = result.replace(re, `$1${p}${NBSP}`);
  }
  // Non-breaking space before г./руб./коп.
  result = result.replace(/ (г\.|руб\.|коп\.)/g, `${NBSP}$1`);
  return result;
}

export function ru(s: string): string {
  return fixPrepositions(fixDashes(fixQuotes(s)));
}
