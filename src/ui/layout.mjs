export const MIN_WIDTH = 60;

/**
 * Get current terminal dimensions.
 */
export function getTermSize() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  return { cols, rows };
}
