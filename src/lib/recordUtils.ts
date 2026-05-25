export interface RecordForm {
  tenant: string;
  tenantId: string;
  room: string;
  cycle: string;
  rentPart: string;
  receivable: string;
  received: string;
  status: string;
  method: string;
  dueDate: string;
  note: string;
  electricPrev: string;
  electricNow: string;
  electricUsage: string;
  electricPrice: string;
  waterPrev: string;
  waterNow: string;
  waterUsage: string;
  waterPrice: string;
  waterMinimumCharge: string;
  propertyFee: string;
  networkFee: string;
  garbageFee: string;
  miscFee: string;
  otherFee: string;
  depositAdjustment: string;
  paidAt?: string;
  noWaterMeter?: boolean;
  tenantStartDate?: string; // 租客入住日期，用于判断首月免水底费
  [key: string]: unknown;
}

export const DEFAULT_ELECTRIC_PRICE = 0.8;
export const DEFAULT_WATER_PRICE = 5.5;

export const defaultForm = (): RecordForm => ({
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

export function normalizeKey(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function normalizeRoomMatch(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[-－_]/g, "")
    .toUpperCase();
}

export function makeRoomKey(building: string | null | undefined, room: string | null | undefined): string {
  return `${String(building || "").trim()}::${normalizeKey(room)}`;
}

export function parseRoomText(value: string | null | undefined): { building: string; room: string } {
  const raw = String(value || "").trim();
  if (!raw) return { building: "", room: "" };
  const m = raw.match(/^(.*?)\s*[-－]\s*(.+)$/);
  if (m) return { building: m[1].trim(), room: m[2].trim() };
  const idx = raw.lastIndexOf(" ");
  if (idx < 0) return { building: "", room: raw };
  return { building: raw.slice(0, idx).trim(), room: raw.slice(idx + 1).trim() };
}

export function isFactoryRoom(formLike: RecordForm | null | undefined): boolean {
  return Boolean(formLike?.noWaterMeter);
}

/** 判断账单周期是否为租客入住首月 */
export function isFirstMonth(formLike: RecordForm | null | undefined): boolean {
  const startDate = formLike?.tenantStartDate;
  if (!startDate) return false;
  const startCycle = startDate.slice(0, 7); // "YYYY-MM"
  const billCycle = formLike.cycle?.slice(0, 7) || "";
  return startCycle === billCycle;
}

export function applyMeterAutoFields(formLike: RecordForm, prevWaterMinimum?: string | number): RecordForm {
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
  const isFirst = isFirstMonth(next);
  // 首月免水底，或用户已手动编辑过，取用户值；否则自动计算
  if (prevWaterMinimum !== undefined) {
    next.waterMinimumCharge = String(prevWaterMinimum);
  } else if (isFirst) {
    next.waterMinimumCharge = "0";
  } else {
    next.waterMinimumCharge = String(disableMinimum ? 0 : (wUsage < 1 ? Math.round(((1 - wUsage) * (Number.isFinite(wPrice) ? wPrice : 0)) * 100) / 100 : 0));
  }
  return next;
}

export function applyOtherFeeParts(formLike: RecordForm): RecordForm {
  const next = { ...formLike };
  const total =
    Number(next.propertyFee || 0) +
    Number(next.networkFee || 0) +
    Number(next.garbageFee || 0) +
    Number(next.miscFee || 0);
  next.otherFee = String(Number.isFinite(total) ? total : 0);
  return next;
}

export function recalcReceivable(formLike: RecordForm): RecordForm {
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

interface FeeItem {
  name?: string;
  unitPrice?: string | number;
  initialReading?: string | number;
}

interface Tenant {
  id?: string;
  feeItems?: FeeItem[];
  [key: string]: unknown;
}

export function pickFeeItem(tenant: Tenant | null | undefined, patterns: RegExp[]): FeeItem | undefined {
  const feeItems = Array.isArray(tenant?.feeItems) ? tenant.feeItems : [];
  return feeItems.find((f) => patterns.some((re) => re.test(String(f?.name || ""))));
}

export function pickValidPrice(value: string | number | null | undefined, fallback: number): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : String(fallback);
}

export function pickMinPrice(value: string | number | null | undefined, minValue: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return String(minValue);
  return String(n < minValue ? minValue : n);
}

export function getTenantFeeDefaults(tenant: Tenant | null | undefined): Record<string, string> {
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
