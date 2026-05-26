import { createHash, randomUUID } from "node:crypto";

export function createLeaseId(name: string, createdAt: string): string {
  const entropy = randomUUID();
  const digest = createHash("sha256")
    .update(`${name}\0${createdAt}\0${entropy}`)
    .digest("hex")
    .slice(0, 12);

  return `lease_${digest}`;
}
