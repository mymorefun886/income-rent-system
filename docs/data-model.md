# 收租佬系统 · 数据模型文档

> 数据存储: `backend/storage/db.json`（单文件 JSON）
> 备份: `backend/storage/backups/db.auto-daily.*.json`

## 核心实体关系

```
properties (房产) ──→ tenants (租客)
                        │
                        ├──→ records (账单)
                        ├──→ contracts (合同)
                        └──→ feeItems (费用项)

expenses (支出) ──→ properties
workOrders (工单) ──→ expenses

entityVersions (版本) ──→ records / tenants / expenses / contracts
auditLogs (审计) ──→ 所有操作
```

---

## 集合清单

### 1. user（系统用户）
单条对象，非数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"u-001"` |
| username | string | 登录用户名 |
| name | string | 显示名称 |
| role | string | `"admin"` / `"readonly"` |
| portfolio | string | 描述，如 `"NAS Docker"` |

### 2. properties（房产档案）
数组，每条对应一个房间。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"prop-{uuid}"` |
| building | string | 楼栋名称，如 `"西山东区17号"` |
| room | string | 房号，如 `"101"` |
| title | string | 显示标题 |
| address | string | 完整地址 |
| area | number | 面积（平方米） |
| layout | string | 户型，如 `"1室1厅1卫"` |
| floor | number | 所在楼层 |
| totalFloor | number | 总楼层 |
| status | string | `"空置"` / `"已出租"` / `"自用"` |
| usageType | string | `"出租"` / `"自用（不出租）"` |
| propertyType | string | `"城中村/农民房"` / `"小区住宅"` / `"公寓"` 等 |
| tenantName | string | 当前租客姓名（冗余） |
| tenantPhone | string | 当前租客电话（冗余） |
| contractEnd | string | 合同到期日 `YYYY-MM-DD` |
| rent | number | 月租金 |
| displayRent | number | 显示租金 |
| tags | string[] | 标签 |
| roomInventory | string[] | 房间设施 |
| roomConfigs | string[] | 房间配置 |
| bankAccount | string | 收款账号 |
| noWaterMeter | boolean | **无用水表**，true 时跳过水费保底 |
| notes | string | 备注 |
| payStatus | object | `{ label, cls }` 收款状态 |

**房间唯一键**: `building::ROOM`（ROOM 为大写去空格）

### 3. tenants（租客档案）
数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"tenant-{uuid}"` |
| name | string | 租客姓名 |
| phone | string | 手机号（1xxxxxxxxxx） |
| idNo | string | 中国身份证号（18位） |
| building | string | 入住房栋 |
| room | string | 入住房号 |
| leaseStart | string | 租期开始 `YYYY-MM-DD` |
| leaseEnd | string | 租期结束 `YYYY-MM-DD` |
| rent | number | 月租金 |
| deposit | number | 押金 |
| status | string | `"正常"` / `"已退租"` |
| archived | boolean | 是否已退租 |
| remind | boolean | 是否发送提醒 |
| wechatGroupName | string | 微信群名 |
| wechatRemark | string | 微信备注 |
| notes | string | 备注 |
| idCardFront | string | 身份证正面照片 URL |
| idCardBack | string | 身份证反面照片 URL |
| feeItems | FeeItem[] | 费用项配置 |
| balance | number | 余额 |
| checkoutDate | string | 退租日期 |

**FeeItem 子结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"fee-{timestamp}-{type}"` |
| name | string | `"电费"` / `"水费"` / `"物业管理费"` / `"宽带费"` / `"税费"` / `"其他费用"` |
| billingMode | string | `"抄表计算"` / `"固定费用"` / `"一次性费用"` |
| unitPrice | number | 单价 |
| unit | string | `"元/度"` / `"元/立方"` / `"元/月"` |
| initialReading | number | 初始抄表读数 |
| hasMinimum | boolean | 是否有保底消费 |
| minimumCharge | number | 保底金额 |

### 4. records（收租账单）
数组，核心交易记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"rec-{uuid}"` |
| tenantId | string | FK → tenants.id |
| tenant | string | 租客姓名（冗余） |
| room | string | 房号显示文本 `"西山东区17号 101"` |
| roomNo | string | 房号 |
| building | string | 楼栋 |
| cycle | string | 账期 `"YYYY-MM"` |
| rentPart | number | 租金部分 |
| receivable | number | 应收总额 |
| received | number | 已收总额（兼容旧数据） |
| status | string | `"未收"` / `"部份收取"` / `"已收"` / `"逾期"` |
| method | string | 收款方式 `"微信"` / `"支付宝"` / `"银行转账"` / `"现金"` |
| dueDate | string | 到期日 |
| paidAt | string | 最后收款日 |
| note | string | 备注 |
| electricPrev | number | 电表上期读数 |
| electricNow | number | 电表本期读数 |
| electricUsage | number | 电实用量（度） |
| electricPrice | number | 电单价（默认 0.8） |
| waterPrev | number | 水表上期读数 |
| waterNow | number | 水表本期读数 |
| waterUsage | number | 水实用量（方） |
| waterPrice | number | 水单价（默认 5.5） |
| waterMinimumCharge | number | 水费保底 |
| propertyFee | number | 物业管理费 |
| networkFee | number | 宽带费 |
| garbageFee | number | 税费 |
| miscFee | number | 其他费用明细 |
| otherFee | number | 其他费用合计 |
| depositAdjustment | number | 押金调整 |
| noWaterMeter | boolean | 是否无用水表 |
| payments | Payment[] | 收款记录 |
| sentStatus | string | `"pending"` / `"sent"` / `"failed"` |
| sentAt | string | 发送时间 |
| source | string | `"meter_ocr"` 或空 |

**Payment 子结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"pay-{timestamp}"` |
| amount | number | 收款金额 |
| paidAt | string | 收款日期 |
| method | string | 收款方式 |
| note | string | 备注 |
| receiptUrl | string | 收据图片 URL（可选） |

### 5. contracts（合同）
数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"contract-{uuid}"` |
| tenantId | string | FK → tenants.id |
| rent | number | 月租金 |
| deposit | number | 押金 |
| payCycle | string | 付款周期 `"monthly"` |
| startDate | string | 开始日期 |
| endDate | string | 结束日期 |
| feeItems | FeeItem[] | 费用项 |
| attachmentUrl | string | 合同附件 URL |
| renewalOf | string | 续租自合同 ID |
| notes | string | 备注 |
| status | string | `"active"` |

### 6. expenses（支出台账）
数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"exp-{uuid}"` |
| date | string | 支出日期 |
| period | string | 账期 `"YYYY-MM"` |
| propertyId | string | FK → properties.id |
| propertyLabel | string | 房产标签 |
| room | string | 房号 |
| category | string | `"日常维修"` / `"物业管理费"` / `"水电费"` 等 |
| amount | number | 金额（> 0） |
| payee | string | 收款方 |
| paymentMethod | string | 支付方式 |
| allocationMode | string | `"single"` / `"shared"` |
| sharedByRooms | string[] | 分摊房号 |
| sourceBillId | string | 关联账单 ID |
| workOrderId | string | FK → workOrders.id |
| invoiceNo | string | 发票号 |
| note | string | 备注 |

### 7. workOrders（维修工单）
数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"wo-{uuid}"` |
| type | string | 工单类型 |
| building | string | 楼栋 |
| room | string | 房号 |
| description | string | 问题描述 |
| photos | string[] | 照片 URL 数组 |
| status | string | `"待处理"` / `"处理中"` / `"已完成"` |
| amount | number | 费用（> 0 时自动创建 expense） |
| date | string | 日期 |
| expenseId | string | 关联支出 ID |

### 8. auditLogs（审计日志）
数组，上限 3000 条。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"audit-{uuid}"` |
| action | string | 点号分隔，如 `"tenant.created"` / `"auth.login.success"` |
| detail | object | 详细信息 |
| operator | string | 操作人 |
| createdAt | ISO string | 时间戳 |

### 9. entityVersions（实体版本历史）
数组，上限 20000 条。支持回滚。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `"ver-{uuid}"` |
| entity | string | `"tenants"` / `"records"` / `"expenses"` / `"contracts"` |
| entityId | string | 实体 ID |
| action | string | `"create"` / `"update"` / `"delete"` / `"rollback"` |
| before | object | 变更前完整快照 |
| after | object | 变更后完整快照 |
| note | string | 备注 |
| operator | string | 操作人 |
| createdAt | ISO string | 时间戳 |

### 10. settings（系统设置）
单条对象。

| 字段 | 类型 | 说明 |
|------|------|------|
| printPayQrUrl | string | 打印账单收款码 URL |
| automationTasks | object | 自动化任务配置（见下文） |
| opsRules | object | 运营规则 |

**automationTasks 子结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| dailyBackup.enabled | boolean | 每日备份开关（默认 true） |
| dailyBackup.runHour | number | 执行时间（默认 6，凌晨 6 点） |
| dailyBackup.keepDays | number | 保留天数（默认 60） |
| contractReminder.enabled | boolean | 合同到期提醒（默认 true） |
| contractReminder.runHour | number | 提醒时间（默认 9） |
| monthlyBillGenerate.enabled | boolean | 月初自动生成账单（默认 false） |
| monthlyBillGenerate.runHour | number | 生成时间（默认 9） |
| lastRuns | object | 各任务上次执行时间 |

**opsRules**:

| 字段 | 类型 | 说明 |
|------|------|------|
| contractDueDays | number | 合同到期预警天数（默认 30） |
| unpaidHighAmount | number | 高额未收阈值（默认 1000） |
| lowProfitThreshold | number | 低收益阈值（默认 0） |

---

## 辅助集合

### reminders（提醒）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 提醒 ID |
| dueDate | string | 到期日 |
| daysBefore | number | 提前天数 |
| remindTime | string | 提醒时间 |
| triggered | string[] | 已触发的日期列表 |

### uploads（上传记录）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 上传 ID |
| originalName | string | 原始文件名 |
| storedAt | string | 存储路径 |
| path | string | 文件路径 |

### meterTasks（抄表任务）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 任务 ID |
| building | string | 楼栋 |
| cycle | string | 账期 |
| readings | object[] | 读数列表 |
| status | string | 任务状态 |

### messageLogs（发送日志）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 日志 ID |
| batchId | string | 批次 ID |
| recordId | string | 关联账单 ID |
| status | string | 发送状态 |
| sentAt | string | 发送时间 |

### importReports（导入报告）
记录 CSV 导入历史，包含成功/失败/跳过计数。

### profitAlerts（收益预警）
记录低收益/空置风险房号。

### runtimeLogs（运行日志）
API 请求日志、自动化任务执行日志、错误日志。自动归档 90 天。
