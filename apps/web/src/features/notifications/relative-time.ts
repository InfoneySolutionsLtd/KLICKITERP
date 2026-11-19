/**
 * `Intl.RelativeTimeFormat`-based, coarsest unit that isn't "0" — good enough for a dropdown list; the full `/notifications` page shows
 * absolute timestamps. `locale` is the app's language (not the browser's), so "il y a 3 minutes" matches the rest of the screen.
 */
export function relativeTime(date: Date, locale?: string): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(seconds, "second");
}
