import path from "node:path";

export function normalizeLedgerPath(input: string): string {
  if (input.trim() === "") {
    return input;
  }

  return path.resolve(input);
}

export function isPathInside(candidate: string, prefix: string): boolean {
  const resolvedCandidate = normalizeLedgerPath(candidate);
  const resolvedPrefix = normalizeLedgerPath(prefix);
  const relative = path.relative(resolvedPrefix, resolvedCandidate);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
