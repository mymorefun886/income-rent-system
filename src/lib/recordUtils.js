const DEFAULT_ELECTRIC_PRICE = 0.8;
const DEFAULT_WATER_PRICE = 5.5;

export const defaultForm = () => ({
  tenant: "",
  tenantId: "",
  room: "",
  cycle: new Date().toISOString().slice(0, 7),
  rentPart: "",
  receivable: "0",
  received: "0",
  status: "未收",
  method: "微信",
  dueDate: `${new Date().toISOString().slice(0, 7)}-10`,
  note: "",
  electricPrev: "",
  electricNow: "",
  electricUsage: "",
  electricPrice: "",
  waterPrev: "",
  waterNow: "",
  waterUsage: "",
  waterPrice: "",
  waterMinimumCharge: "0",
  propertyFee: "0",
  networkFee: "0",
  garbageFee: "0",
  miscFee: "0",
  otherFee: "0",
  depositAdjustment: "0",
});

export function normalizeKey(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function normalizeRoomMatch(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[-－_]/g, "")
    .toUpperCase();
}

export function makeRoomKey(building, room) {
  return `${String(building || "").trim()}::${normalizeKey(room)}`;
}

export function parseRoomText(value) {
  const raw = String(value || "").trim();
  if (!raw) return { building: "", room: "" };
  const m = raw.match(/^(.*?)\s*[-－]\s*(.+)$/);
  if (m) return { building: m[1].trim(), room: m[2].trim() };
  const idx = raw.lastIndexOf(" ");
  if (idx < 0) return { building: "", room: raw };
  return { building: raw.slice(0, idx).trim(), room: raw.slice(idx + 1).trim() };
}

export function isFactoryRoom(formLike) {
  return Boolean(formLike?.noWaterMeter);
}

export function applyMeterAutoFields(formLike) {
  const next = { ...formLike };
  const ePrev = Number(next.electricPrev || 0);
  const eNow = Number(next.electricNow || 0);
  const wPrev = Number(next.waterPrev || 0);
  const wNow = Number(next.waterNow || 0);
  const wPrice = Number(next.waterPrice || 0);

  const eUsage = Math.max(0, eNow - ePrev);
  const wUsage = Math.max(0, wNow - wPrev);

  next.electricUsage = String(Number.isFinite(eUsage) ? eUsage : 0);
  next.waterUsage = String(Number.isFinite(wUsage) ? wUsage : 0);
  const disableMinimum = isFactoryRoom(next);
  next.waterMinimumCharge = String(disableMinimum ? 0 : (wUsage < 1 ? Math.round(((1 - wUsage) * (Number.isFinite(wPrice) ? wPrice : 0)) * 100) / 100 : 0));
  return next;
}

export function applyOtherFeeParts(formLike) {
  const next = { ...formLike };
  const total =
    Number(next.propertyFee || 0) +
    Number(next.networkFee || 0) +
    Number(next.garbageFee || 0) +
    Number(next.miscFee || 0);
  next.otherFee = String(Number.isFinite(total) ? total : 0);
  return next;
}

export function recalcReceivable(formLike) {
  const next = { ...formLike };
  const rentPart = Number(next.rentPart || 0);
  const electricUsage = Number(next.electricUsage || 0);
  const electricPrice = Number(next.electricPrice || 0);
  const waterUsage = Number(next.waterUsage || 0);
  const waterPrice = Number(next.waterPrice || 0);
  const waterMinimumCharge = Number(next.waterMinimumCharge || 0);
  const otherFee = Number(next.otherFee || 0);
  const depositAdjustment = Number(next.depositAdjustment || 0);
  const receivable = rentPart + electricUsage * electricPrice + waterUsage * waterPrice + waterMinimumCharge + otherFee + depositAdjustment;
  next.receivable = String(Math.round(receivable));
  return next;
}

export function pickFeeItem(tenant, patterns) {
  const feeItems = Array.isArray(tenant?.feeItems) ? tenant.feeItems : [];
  return feeItems.find((f) => patterns.some((re) => re.test(String(f?.name || ""))));
}

export function pickValidPrice(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : String(fallback);
}

export function pickMinPrice(value, minValue) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return String(minValue);
  return String(n < minValue ? minValue : n);
}

export function getTenantFeeDefaults(tenant) {
  const electric = pickFeeItem(tenant, [/电/i, /electric/i]);
  const water = pickFeeItem(tenant, [/水/i, /water/i]);
  const propertyFee = pickFeeItem(tenant, [/物业/i]);
  const networkFee = pickFeeItem(tenant, [/网络/i, /宽带/i, /wifi/i]);
  const garbageFee = pickFeeItem(tenant, [/税费/i, /垃圾/i]);
  const miscFee = pickFeeItem(tenant, [/其他/i]);
  return {
    electricPrice: pickValidPrice(electric?.unitPrice, DEFAULT_ELECTRIC_PRICE),
    waterPrice: pickValidPrice(water?.unitPrice, DEFAULT_WATER_PRICE),
    electricInitial: electric?.initialReading ?? "",
    waterInitial: water?.initialReading ?? "",
    propertyFee: propertyFee?.unitPrice ?? "0",
    networkFee: networkFee?.unitPrice ?? "0",
    garbageFee: garbageFee?.unitPrice ?? "0",
    miscFee: miscFee?.unitPrice ?? "0",
  };
}

export { DEFAULT_ELECTRIC_PRICE, DEFAULT_WATER_PRICE };
