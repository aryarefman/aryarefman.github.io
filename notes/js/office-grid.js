// Plot layout for the Offices city: building i stands on grid cell i. The grid fills a square first
// (1, then 2x2, 3x3, 4x4 ...), one L-shaped ring at a time, so the slab stays roughly square.
// Pure, so test/office-grid.test.mjs can run it without a browser.
export function gridCell(i) {
  const k = Math.ceil(Math.sqrt(i + 1)), j = i - (k - 1) ** 2; // ring k holds cells (k-1)^2 .. k^2-1
  if (k === 1) return { col: 0, row: 0 };
  if (j < k - 1) return { col: k - 1, row: j };          // down the new right column
  if (j < 2 * (k - 1)) return { col: j - (k - 1), row: k - 1 }; // along the new back row
  return { col: k - 1, row: k - 1 };                     // the corner closes the square
}

// Bounding columns and rows of the first n buildings.
export function gridSize(n) {
  let cols = 1, rows = 1;
  for (let i = 0; i < n; i++) { const c = gridCell(i); cols = Math.max(cols, c.col + 1); rows = Math.max(rows, c.row + 1); }
  return { cols, rows };
}
