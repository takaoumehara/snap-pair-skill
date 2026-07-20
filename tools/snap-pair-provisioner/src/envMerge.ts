/** Merge KEY=VALUE lines into existing .env text. Same key overwrites in place;
 *  new keys append at the end; comments and blank lines are preserved. */
export function mergeEnv(existing: string, lines: string[]): string {
  const keyOf = (l: string) => {
    const i = l.indexOf("=");
    return i > 0 && !l.trimStart().startsWith("#") ? l.slice(0, i) : null;
  };
  const incoming = new Map<string, string>();
  for (const l of lines) {
    const k = keyOf(l);
    if (k) incoming.set(k, l);
  }
  const used = new Set<string>();
  const existingLines = existing.split("\n");
  // Drop a single trailing empty element from a final newline so we control spacing.
  if (existingLines.length && existingLines[existingLines.length - 1] === "") {
    existingLines.pop();
  }
  const merged = existingLines.map((l) => {
    const k = keyOf(l);
    if (k && incoming.has(k)) {
      used.add(k);
      return incoming.get(k)!;
    }
    return l;
  });
  for (const [k, l] of incoming) {
    if (!used.has(k)) merged.push(l);
  }
  return merged.join("\n") + "\n";
}
