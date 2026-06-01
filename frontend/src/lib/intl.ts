/**
 * Russian-locale formatters via Intl. Cached at module level to avoid
 * re-instantiating on every render.
 */

const _date = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const _dateShort = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
});

const _time = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const _timeWithSeconds = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const _weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });

export function formatDate(d: Date | string): string {
  return _date.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateShort(d: Date | string): string {
  return _dateShort.format(typeof d === "string" ? new Date(d) : d);
}

export function formatTime(d: Date | string): string {
  return _time.format(typeof d === "string" ? new Date(d) : d);
}

export function formatTimeWithSeconds(d: Date | string): string {
  return _timeWithSeconds.format(typeof d === "string" ? new Date(d) : d);
}

export function formatWeekday(d: Date | string): string {
  return _weekday.format(typeof d === "string" ? new Date(d) : d);
}
