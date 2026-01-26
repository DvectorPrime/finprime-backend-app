export function getMonthDateRange(offset = 0) {
  const now = new Date();
  // Subtract 'offset' months from current date
  const targetDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  // "2026-01" format for the Budget Table
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  
  // "Jan" format for the Chart Label
  const label = targetDate.toLocaleString('default', { month: 'short' });

  // Start of month (e.g., 2026-01-01T00:00:00.000Z)
  const start = new Date(year, month, 1).toISOString();
  
  // End of month (e.g., 2026-01-31T23:59:59.999Z)
  // We go to the 0th day of the NEXT month to get the last day of THIS month
  const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  return { monthKey, label, start, end };
}