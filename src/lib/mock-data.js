export const loginGuide = {
  defaultUsername: "morefun886",
  defaultPassword: "Mf848886#",
};

export const demoUser = {
  id: "u-001",
  username: "19020967028",
  name: "陈先生",
  role: "房东管理员",
  portfolio: "城中村公寓 3 栋 / 30 间",
};

export const landingHighlights = [
  {
    title: "严格参照房东利器的操作结构",
    description:
      "首页、房产管理、租客档案、收租台账、帮助文档和系统设置都按房东利器的使用习惯重新整理，便于后续继续做本地化替换。",
  },
  {
    title: "前端托管在 Cloudflare Pages",
    description:
      "前端默认面向 income.ccwu.cc，适合电脑与手机访问，后续也方便继续通过 Cloudflare Workers 做边缘代理。",
  },
  {
    title: "后端和附件落地到 NAS Docker",
    description:
      "房源、租客、账单、图片和合同等内容统一保存在绿联云 NAS，本地掌控数据，更利于备份和迁移。",
  },
];

export const dashboardSummary = {
  unpaid30Days: 2,
  expiringLeases: 1,
  ownerPending: 1,
  vacantRooms: 1,
  monthlyReceivable: 12200,
  monthlyReceived: 5400,
  monthlyPayable: 6100,
  monthlyPaid: 4200,
  actualProfit: 6800,
  bookedProfit: 9200,
};

export const quickEntries = [
  { label: "房产", value: "4 套", hint: "楼栋、房号、空置状态统一查看" },
  { label: "租客", value: "5 人", hint: "当前在租与历史租客分开展示" },
  { label: "账单", value: "4 笔", hint: "已收、待收、逾期一目了然" },
  { label: "到期提醒", value: "1 条", hint: "优先跟进即将到期租约" },
];

export const financialTrend = [
  { month: "11月", income: 24200, expenses: 4800, profit: 19400 },
  { month: "12月", income: 24800, expenses: 5100, profit: 19700 },
  { month: "1月", income: 25200, expenses: 5800, profit: 19400 },
  { month: "2月", income: 26600, expenses: 5900, profit: 20700 },
  { month: "3月", income: 27400, expenses: 6200, profit: 21200 },
  { month: "4月", income: 28600, expenses: 7200, profit: 21400 },
];

export const roomStats = [
  { name: "已出租", value: 3 },
  { name: "空置", value: 1 },
];

export const leaseStats = [
  { name: "正常", value: 2 },
  { name: "待收", value: 1 },
  { name: "即将到期", value: 1 },
];

export const accountStats = [
  { name: "总收入", value: 12200 },
  { name: "总支出", value: 6100 },
];

export const rentReminders = [
  {
    id: "rr-101",
    tenant: "李秀兰",
    room: "A栋302",
    amount: 3200,
    dueDate: "2026-05-01",
    phone: "13800138026",
    status: "明日到期",
  },
  {
    id: "rr-102",
    tenant: "周海涛",
    room: "B栋105",
    amount: 2800,
    dueDate: "2026-05-02",
    phone: "13800138015",
    status: "2 天后到期",
  },
];

export const properties = [
  {
    id: "prop-001",
    building: "A栋",
    room: "A栋101",
    title: "A栋101 单间",
    address: "广州市番禺区南村镇东兴路 18 号",
    area: 28,
    layout: "单间带卫",
    rent: 2600,
    status: "已出租",
    tenantName: "黄嘉怡",
    contractEnd: "2026-10-31",
    tags: ["近地铁", "可月付"],
  },
  {
    id: "prop-002",
    building: "A栋",
    room: "A栋302",
    title: "A栋302 一室一厅",
    address: "广州市番禺区南村镇东兴路 18 号",
    area: 42,
    layout: "一室一厅",
    rent: 3200,
    status: "待收租",
    tenantName: "李秀兰",
    contractEnd: "2026-05-20",
    tags: ["独立阳台", "家电齐全"],
  },
  {
    id: "prop-003",
    building: "B栋",
    room: "B栋105",
    title: "B栋105 单间",
    address: "广州市番禺区大学城南亭村中路 6 号",
    area: 24,
    layout: "单间",
    rent: 2800,
    status: "待收租",
    tenantName: "周海涛",
    contractEnd: "2026-08-14",
    tags: ["水电分摊", "付一押二"],
  },
  {
    id: "prop-004",
    building: "C栋",
    room: "C栋203",
    title: "C栋203 两房一厅",
    address: "广州市番禺区大学城南亭村西街 9 号",
    area: 56,
    layout: "两房一厅",
    rent: 3600,
    status: "空置",
    tenantName: "",
    contractEnd: "-",
    tags: ["可拎包入住", "朝南"],
  },
];

export const tenants = [
  {
    id: "tenant-001",
    name: "李秀兰",
    phone: "13800138026",
    emergencyContact: "李先生 13800138027",
    room: "A栋302",
    leaseStart: "2025-05-21",
    leaseEnd: "2026-05-20",
    rent: 3200,
    deposit: 6400,
    status: "即将到期",
    archived: false,
    idNo: "440106199309120024",
    notes: "每月 1 日收租，偏好微信支付。",
  },
  {
    id: "tenant-002",
    name: "周海涛",
    phone: "13800138015",
    emergencyContact: "周女士 13800138016",
    room: "B栋105",
    leaseStart: "2025-08-15",
    leaseEnd: "2026-08-14",
    rent: 2800,
    deposit: 5600,
    status: "正常",
    archived: false,
    idNo: "440106199002280052",
    notes: "有车位需求，已备案身份证照片。",
  },
  {
    id: "tenant-003",
    name: "黄嘉怡",
    phone: "13800138011",
    emergencyContact: "黄女士 13800138012",
    room: "A栋101",
    leaseStart: "2025-11-01",
    leaseEnd: "2026-10-31",
    rent: 2600,
    deposit: 5200,
    status: "正常",
    archived: false,
    idNo: "440106199811230018",
    notes: "合同、转账截图与入住照片已归档到 NAS。",
  },
  {
    id: "tenant-old-001",
    name: "张文凯",
    phone: "13800138111",
    emergencyContact: "张女士 13800138112",
    room: "A栋105",
    leaseStart: "2024-03-01",
    leaseEnd: "2025-02-28",
    rent: 2600,
    deposit: 5200,
    status: "已退租",
    archived: true,
    idNo: "440106198912120031",
    notes: "退租时已完成水电结清与押金结算。",
  },
  {
    id: "tenant-old-002",
    name: "陈雨欣",
    phone: "13800138123",
    emergencyContact: "陈先生 13800138124",
    room: "B栋203",
    leaseStart: "2024-06-10",
    leaseEnd: "2025-06-09",
    rent: 3100,
    deposit: 6200,
    status: "已退租",
    archived: true,
    idNo: "440106199605150048",
    notes: "合同归档完成，历史账单保留。",
  },
];

export const rentRecords = [
  {
    id: "bill-001",
    tenant: "黄嘉怡",
    room: "A栋101",
    cycle: "2026-04",
    receivable: 2600,
    received: 2600,
    dueDate: "2026-04-02",
    paidAt: "2026-04-02",
    method: "微信",
    status: "已收",
    note: "自动提醒后当天到账。",
  },
  {
    id: "bill-002",
    tenant: "李秀兰",
    room: "A栋302",
    cycle: "2026-04",
    receivable: 3200,
    received: 0,
    dueDate: "2026-05-01",
    paidAt: "-",
    method: "待定",
    status: "待收",
    note: "明日到期，已加入提醒清单。",
  },
  {
    id: "bill-003",
    tenant: "周海涛",
    room: "B栋105",
    cycle: "2026-04",
    receivable: 2800,
    received: 2800,
    dueDate: "2026-04-04",
    paidAt: "2026-04-04",
    method: "银行转账",
    status: "已收",
    note: "附带水费 120 元。",
  },
  {
    id: "bill-004",
    tenant: "李秀兰",
    room: "A栋302",
    cycle: "2026-05",
    receivable: 3600,
    received: 0,
    dueDate: "2026-04-25",
    paidAt: "-",
    method: "待定",
    status: "逾期",
    note: "已设置二次催收。",
  },
];

export const deploymentBlueprint = [
  {
    title: "Cloudflare Pages / Workers",
    points: [
      "部署静态前端并绑定域名 income.ccwu.cc。",
      "通过环境变量配置 NAS API 地址，例如 VITE_API_BASE_URL。",
      "如需隐藏源站地址，可额外使用 Cloudflare Worker 做 API 反向代理。",
    ],
  },
  {
    title: "绿联云 NAS Docker",
    points: [
      "运行本地 API 容器，负责账号密码登录、房产、租客、账单和图片上传。",
      "将 ./storage/uploads 映射到 NAS 持久目录，保存合同、证件和房屋图片。",
      "将 ./storage/db.json 映射到 NAS 持久目录，保存结构化数据。",
    ],
  },
];

export const helpSections = [
  {
    title: "你现在拿到的是什么",
    body:
      "这是一个按房东利器使用路径整理的本地化 MVP，首页、房产管理、租客档案、收租台账、帮助文档和部署说明都已整理成简体中文。",
  },
  {
    title: "为什么采用前后端分离",
    body:
      "Cloudflare 负责前端访问速度和域名入口，NAS 负责数据主权、文件存储和鉴权接口，这样既方便外部访问，又能让核心数据保留在本地。",
  },
  {
    title: "和房东利器的对应关系",
    body:
      "首页保留搜索、快捷入口、30 天未收、租约到期、空置房号和今日收租提醒；房产页拆分为单套房产与整栋录入；账单页对应到已收、待收和逾期记录。",
  },
  {
    title: "建议的下一步",
    body:
      "优先把 NAS 上的 API 与上传目录跑通，再把前端环境变量指向真实 API，随后逐步把演示数据替换为 NAS 中的真实房产、租客与收租记录。",
  },
];
