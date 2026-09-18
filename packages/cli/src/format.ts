/** Prints rows as left-aligned columns under a header. */
export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? "").length))
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd();

  console.log(line(headers));
  for (const row of rows) console.log(line(row));
}

/** ISO timestamp shortened to minutes in UTC, or "-" when absent. */
export function shortTime(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "-";
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
