export const quickLeaseButtons = [
  { label: "半年", months: 6 },
  { label: "一年", months: 12 },
  { label: "两年", months: 24 },
];

export const unitOptions = ["元/度", "元/吨", "元/立方", "元/月", "元/次"];
export const billingModes = ["抄表计算", "固定费用", "一次性费用"];
export const feeNameOptions = ["电费", "水费", "物业管理费", "宽带费", "税费", "其他费用"];

export const SHENZHEN_ELECTRIC_PRICE = 0.80;
export const SHENZHEN_WATER_PRICE = 5.50;

export interface FeeItem {
  id: string;
  name: string;
  billingMode: string;
  unitPrice: string;
  unit: string;
  initialReading: string;
  hasMinimum: boolean;
  minimumCharge: string;
}

export function defaultFeeItems(): FeeItem[] {
  return [
    { id: `fee-${Date.now()}-electric`, name: "电费", billingMode: "抄表计算", unitPrice: String(SHENZHEN_ELECTRIC_PRICE), unit: "元/度", initialReading: "0", hasMinimum: false, minimumCharge: "0" },
    { id: `fee-${Date.now()}-water`, name: "水费", billingMode: "抄表计算", unitPrice: String(SHENZHEN_WATER_PRICE), unit: "元/立方", initialReading: "0", hasMinimum: true, minimumCharge: String(SHENZHEN_WATER_PRICE) },
  ];
}

export function validateChineseIdCard(idNumber: string): { valid: boolean; message: string } {
  const id = String(idNumber || "").trim();
  if (!id) return { valid: true, message: "" };
  if (!/^\d{17}[\dXx]$/.test(id)) return { valid: false, message: "身份证号必须为18位" };
  const birth = id.substring(6, 14);
  const year = parseInt(birth.substring(0, 4), 10);
  const month = parseInt(birth.substring(4, 6), 10);
  const day = parseInt(birth.substring(6, 8), 10);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return { valid: false, message: "身份证号中的出生日期无效" };
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkChars = "10X98765432";
  const sum = id.substring(0, 17).split("").reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
  const expected = checkChars[sum % 11];
  if (id[17].toUpperCase() !== expected) return { valid: false, message: "身份证号校验位不正确" };
  return { valid: true, message: "" };
}

export function applyFeePreset(item: FeeItem, name: string): FeeItem {
  const next = { ...item, name };
  if (name === "电费") {
    next.billingMode = "抄表计算";
    next.unit = "元/度";
    next.unitPrice = String(SHENZHEN_ELECTRIC_PRICE);
    next.hasMinimum = false;
    next.minimumCharge = "0";
  }
  if (name === "水费") {
    next.billingMode = "抄表计算";
    next.unit = "元/立方";
    next.unitPrice = String(SHENZHEN_WATER_PRICE);
    next.hasMinimum = true;
    next.minimumCharge = String(SHENZHEN_WATER_PRICE);
  }
  return next;
}

export function makeTenantRoomKey(building: string, room: string): string {
  const normalize = (v: string) => String(v || "").replace(/\s+/g, "").toUpperCase();
  return `${String(building || "").trim()}::${normalize(room)}`;
}

export function addMonths(dateString: string, months: number): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export interface TenantForm {
  name: string;
  phone: string;
  idNo: string;
  building: string;
  room: string;
  leaseStart: string;
  leaseEnd: string;
  rent: string;
  deposit: string;
  status: string;
  remind: boolean;
  wechatGroupName: string;
  wechatRemark: string;
  notes: string;
  idCardFront: string;
  idCardBack: string;
  feeItems: FeeItem[];
}

export function makeForm(): TenantForm {
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  return {
    name: "", phone: "", idNo: "", building: "", room: "",
    leaseStart: now.toISOString().slice(0, 10),
    leaseEnd: end.toISOString().slice(0, 10),
    rent: "0", deposit: "0", status: "正常", remind: true,
    wechatGroupName: "", wechatRemark: "", notes: "",
    idCardFront: "", idCardBack: "",
    feeItems: defaultFeeItems(),
  };
}

export function toForm(tenant: Record<string, unknown>): TenantForm {
  return {
    name: String(tenant.name || ""),
    phone: String(tenant.phone || ""),
    idNo: String(tenant.idNo || ""),
    building: String(tenant.building || ""),
    room: String(tenant.room || ""),
    leaseStart: String(tenant.leaseStart || makeForm().leaseStart),
    leaseEnd: String(tenant.leaseEnd || makeForm().leaseEnd),
    rent: String(tenant.rent ?? 0),
    deposit: String(tenant.deposit ?? 0),
    status: String(tenant.status || "正常"),
    remind: tenant.remind ?? true,
    wechatGroupName: String(tenant.wechatGroupName || ""),
    wechatRemark: String(tenant.wechatRemark || ""),
    notes: String(tenant.notes || ""),
    idCardFront: String(tenant.idCardFront || ""),
    idCardBack: String(tenant.idCardBack || ""),
    feeItems: Array.isArray(tenant.feeItems) && tenant.feeItems.length
      ? (tenant.feeItems as Record<string, unknown>[]).map((f, i) => ({
          id: String(f.id || `fee-${i + 1}`),
          name: String(f.name || ""),
          billingMode: String(f.billingMode || "固定费用"),
          unitPrice: String(f.unitPrice ?? 0),
          unit: String(f.unit || "元/月"),
          initialReading: String(f.initialReading ?? 0),
          hasMinimum: Boolean(f.hasMinimum),
          minimumCharge: String(f.minimumCharge ?? 0),
        }))
      : defaultFeeItems(),
  };
}
