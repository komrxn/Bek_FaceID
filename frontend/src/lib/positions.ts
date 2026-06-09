/**
 * Position catalog — the standardized list of staff roles, grouped under
 * the structured `department` axis (V1.5).
 *
 * Before V1.5 `position` was free-text typed by hand at enrollment, which
 * produced inconsistent spellings ("Повар" / "повар" / "Повар 1-блюда")
 * that made dashboard filtering by role impossible. The manager
 * standardized the staff structure: every employee now picks a role from
 * the fixed list for their department.
 *
 * `position` is still stored as the plain Russian label (the Excel табель
 * and every list view consume the raw string) — this catalog is the
 * single source of truth that constrains which labels are valid, enforced
 * at the enrollment UI. Keep in sync with the manager's official tree.
 */

import type { Department } from "./zod";

export const POSITIONS_BY_DEPARTMENT: Record<Department, readonly string[]> = {
  hall: ["Официанты", "Зав Зала"],
  kitchen: [
    "1-блюда",
    "2-блюда",
    "Салат",
    "Шашлык",
    "Пекарня",
    "Чайханщик",
    "Другие повара",
    "Уборка",
    "посудомойка",
  ],
  other: ["Касса", "Бармен", "Базарком", "ЗавСклад", "Управляющий", "Курьер", "Нянька"],
};

/** Flat list of every catalog position, department order preserved. */
export const ALL_POSITIONS: readonly string[] = [
  ...POSITIONS_BY_DEPARTMENT.hall,
  ...POSITIONS_BY_DEPARTMENT.kitchen,
  ...POSITIONS_BY_DEPARTMENT.other,
];

export function positionsFor(dept: Department): readonly string[] {
  return POSITIONS_BY_DEPARTMENT[dept];
}

/** Which department a catalog position belongs to, or null if off-catalog. */
export function departmentForPosition(position: string): Department | null {
  for (const dept of Object.keys(POSITIONS_BY_DEPARTMENT) as Department[]) {
    if (POSITIONS_BY_DEPARTMENT[dept].includes(position)) return dept;
  }
  return null;
}

/**
 * A stored `position` is `"<base> <detail?>"`, where `<base>` is a catalog
 * role and `<detail>` is an optional hand-typed qualifier ("старший", "2",
 * "помощник"). Fully custom roles (off-catalog) have no base.
 *
 * Catalog bases are checked longest-first so a multi-word base ("Зав Зала")
 * wins over any shorter accidental prefix.
 */
const BASES_BY_LENGTH: readonly string[] = [...ALL_POSITIONS].sort(
  (a, b) => b.length - a.length
);

export function splitPosition(position: string): { base: string; detail: string } {
  const value = position.trim();
  if (ALL_POSITIONS.includes(value)) return { base: value, detail: "" };
  for (const base of BASES_BY_LENGTH) {
    if (value.startsWith(base + " ")) {
      return { base, detail: value.slice(base.length + 1).trim() };
    }
  }
  return { base: "", detail: "" }; // custom / off-catalog
}

export function composePosition(base: string, detail: string): string {
  const d = detail.trim();
  return d ? `${base} ${d}` : base;
}

/** Does a stored position fall under the given catalog base filter? */
export function matchesPositionFilter(position: string, base: string): boolean {
  return position === base || position.startsWith(base + " ");
}
