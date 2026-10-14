export function formatDate(
  date: Date | string | number | undefined,
  options: Intl.DateTimeFormatOptions = {}
) {
  if (!date) {
    return ""
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: options.month ?? "long",
      day: options.day ?? "numeric",
      year: options.year ?? "numeric",
      ...options,
    }).format(new Date(date))
  } catch {
    return ""
  }
}
