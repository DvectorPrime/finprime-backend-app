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

  const start = new Date(year, month, 0, 0, 0, 0).toISOString();
  
  const end = new Date(year, month + 1, -1, 24, 0, 0).toISOString();

  return { monthKey, label, start, end };
}