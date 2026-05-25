export function normalizeRoomToken(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[－–—_]/g, "-")
    .toUpperCase();
}

export function normalizeBuildingToken(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function parseRoomText(value: string | null | undefined): { building: string; room: string } {
  const raw = String(value || "").trim();
  if (!raw) return { building: "", room: "" };
  const m = raw.match(/^(.*?)\s*[-－]\s*(.+)$/);
  if (m) return { building: String(m[1] || "").trim(), room: String(m[2] || "").trim() };
  return { building: "", room: raw };
}

export function makeRoomKey(building: string | null | undefined, room: string | null | undefined): string {
  return `${normalizeBuildingToken(building)}::${normalizeRoomToken(room)}`;
}

export function normalizeRoomMatch(value: string | null | undefined): string {
  const parsed = parseRoomText(value);
  if (parsed.building) return makeRoomKey(parsed.building, parsed.room);
  return normalizeRoomToken(parsed.room || value);
}
