export function normalizeRoomToken(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[－–—_]/g, "-")
    .toUpperCase();
}

export function normalizeBuildingToken(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function parseRoomText(value) {
  const raw = String(value || "").trim();
  if (!raw) return { building: "", room: "" };
  const m = raw.match(/^(.*?)\s*[-－]\s*(.+)$/);
  if (m) return { building: String(m[1] || "").trim(), room: String(m[2] || "").trim() };
  return { building: "", room: raw };
}

export function makeRoomKey(building, room) {
  return `${normalizeBuildingToken(building)}::${normalizeRoomToken(room)}`;
}

export function normalizeRoomMatch(value) {
  const parsed = parseRoomText(value);
  if (parsed.building) return makeRoomKey(parsed.building, parsed.room);
  return normalizeRoomToken(parsed.room || value);
}
