import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileClock, Image, Send, Upload } from "lucide-react";
import { toPng } from "html-to-image";
import {
  apiEnabled,
  clearRecords,
  createMeterTask,
  createRecord,
  deleteRecord,
  fetchProperties,
  fetchRecords,
  fetchSettings,
  fetchTenants,
  fetchWechatMessages,
  generateBillsFromReadings,
  confirmMeterTask,
  markBillSent,
  updateRecord,
  uploadFile,
} from "../lib/api";
import { rentRecords as fallbackRecords } from "../lib/mock-data";
import { formatCurrency, formatDate, getStatusTone } from "../lib/format";
import {
  defaultForm,
  normalizeKey,
  normalizeRoomMatch,
  makeRoomKey,
  parseRoomText,
  applyMeterAutoFields,
  applyOtherFeeParts,
  recalcReceivable,
  getTenantFeeDefaults,
  pickMinPrice,
  isFactoryRoom,
  DEFAULT_ELECTRIC_PRICE,
  DEFAULT_WATER_PRICE,
} from "../lib/recordUtils";
import ConfirmDialog from "../components/ConfirmDialog";
import QuickPayModal from "../components/QuickPayModal";
import RecordFormModal from "../components/RecordFormModal";
import { useProperties, useRecords, useSettings, useTenants } from "../hooks/useApiQuery";
import { useQueryClient } from "@tanstack/react-query";

const RentRecordsPage = () => {
  const queryClient = useQueryClient();

  const { data: queryRecords = [], isLoading: rLoading } = useRecords();
  const { data: queryTenants = [], isLoading: tLoading } = useTenants();
  const { data: queryProperties = [], isLoading: pLoading } = useProperties();
  const { data: querySettings } = useSettings({ enabled: apiEnabled });
  const loading = rLoading || tLoading || pLoading;

  const [records, setRecords] = useState(apiEnabled ? queryRecords : fallbackRecords);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState("");
  const [backendHint, setBackendHint] = useState("");

  // Sync query data to local state
  React.useEffect(() => {
    if (apiEnabled && queryRecords.length > 0) {
      setRecords(queryRecords);
    }
  }, [queryRecords]);

  React.useEffect(() => {
    if (apiEnabled && queryTenants.length > 0) {
      setTenants(queryTenants.filter((x) => !x.archived));
    }
  }, [queryTenants]);

  React.useEffect(() => {
    if (apiEnabled && queryProperties.length > 0) {
      setProperties(queryProperties);
    }
  }, [queryProperties]);

  React.useEffect(() => {
    const serverQr = String(querySettings?.printPayQrUrl || "").trim();
    if (serverQr) {
      localStorage.setItem("income-print-pay-qr", serverQr);
      setPrintPayQrUrl(serverQr);
    }
    setBackendHint("");
  }, [querySettings]);

  const [sheetBuilding, setSheetBuilding] = useState("");
  const [sheetCycle, setSheetCycle] = useState(new Date().toISOString().slice(0, 7));
  const [sheetDate, setSheetDate] = useState(new Date().toISOString().slice(0, 10));
  const [sheetReadings, setSheetReadings] = useState([]);
  const [sheetInfo, setSheetInfo] = useState("");
  const [meterTaskId, setMeterTaskId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [wechatMessages, setWechatMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roomFilter, setRoomFilter] = useState("all");
  const [quickPayTarget, setQuickPayTarget] = useState(null);
  const [flashRowId, setFlashRowId] = useState("");
  const [billImages, setBillImages] = useState([]);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [csvPasteText, setCsvPasteText] = useState("");
  const [singleCard, setSingleCard] = useState(null);
  const cardRefs = useRef({});
  const [form, setForm] = useState(defaultForm());
  const [waterMinimumEdited, setWaterMinimumEdited] = useState(false);
  const [printPayQrUrl, setPrintPayQrUrl] = useState(() => localStorage.getItem("income-print-pay-qr") || "");


  const totals = useMemo(() => {
    const receivable = records.reduce((s, x) => s + Number(x.receivable || 0), 0);
    const received = records.reduce((s, x) => s + Number(x.received || 0), 0);
    return { receivable, received, unpaid: receivable - received };
  }, [records]);

  function parseRoomSortKey(roomText) {
    const text = String(roomText || "").trim();
    if (!text) return { building: "", roomNum: "", num: 0 };
    const idx = text.lastIndexOf(" ");
    const building = idx >= 0 ? text.slice(0, idx) : "";
    const room = idx >= 0 ? text.slice(idx + 1) : text;
    const numMatch = String(room).match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    return { building, roomNum: room, num };
  }
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      // 1. 最新周期优先
      const cycleCmp = String(b.cycle || "").localeCompare(String(a.cycle || ""), "zh-Hans-CN");
      if (cycleCmp !== 0) return cycleCmp;
      // 2. 楼栋排序
      const ka = parseRoomSortKey(a.room);
      const kb = parseRoomSortKey(b.room);
      const bldCmp = ka.building.localeCompare(kb.building, "zh-Hans-CN");
      if (bldCmp !== 0) return bldCmp;
      // 3. 房号数字排序
      if (ka.num !== kb.num) return ka.num - kb.num;
      return ka.roomNum.localeCompare(kb.roomNum, "zh-Hans-CN", { numeric: true });
    });
  }, [records]);

  const tenantOptions = useMemo(
    () => {
      const usageMap = new Map(
        (properties || []).map((p) => [makeRoomKey(p.building, p.room), String(p.usageType || "")]),
      );
      return tenants
        .filter((t) => usageMap.get(makeRoomKey(t.building, t.room)) !== "自用（不出租）")
        .map((t) => ({
          id: t.id,
          name: t.name || "",
          room: t.building ? `${t.building} ${t.room || ""}` : t.room || "",
        }))
        .sort((a, b) => `${a.name}${a.room}`.localeCompare(`${b.name}${b.room}`, "zh-Hans-CN"));
    },
    [tenants, properties],
  );

  const latestRecordByRoom = useMemo(() => {
    const map = new Map();
    for (const r of records || []) {
      const key = normalizeRoomMatch(r.room);
      const prev = map.get(key);
      const prevScore = prev ? String(prev.cycle || prev.dueDate || "") : "";
      const currScore = String(r.cycle || r.dueDate || "");
      if (!prev || currScore.localeCompare(prevScore, "zh-Hans-CN", { numeric: true }) > 0) map.set(key, r);
    }
    return map;
  }, [records]);

  const activeTenantKeys = useMemo(() => new Set((tenants||[]).filter(t=>!t.archived).map(t=>makeRoomKey(t.building,t.room))), [tenants]);

  const roomOptions = useMemo(() => {
    const fromTenants = (tenants || [])
      .map((t) => {
        const roomText = t.building ? `${t.building} ${t.room || ""}` : t.room || "";
        const key = makeRoomKey(t.building, t.room);
        const archived = Boolean(t.archived);
        // 同一房号有活跃租客时不标"(已退租)"
        const showArchived = archived && !activeTenantKeys.has(key);
        return { key, roomText, label: roomText + (showArchived ? " (已退租)" : ""), tenantId: t.id, tenantName: t.name || "", rent: Number(t.rent || 0), archived };
      });
    // 从账单记录中补充退租/历史房号（只有当前无租客时才添加）
    const seen = new Set(fromTenants.map((x) => x.key));
    const fromRecords = (records || [])
      .filter((r) => {
        const p = parseRoomText(r.room || "");
        const key = makeRoomKey(p.building, p.room);
        return key && !seen.has(key) && !activeTenantKeys.has(key);
      })
      .reduce((acc, r) => {
        const p = parseRoomText(r.room || "");
        const key = makeRoomKey(p.building, p.room);
        if (acc.find(x => x.key === key)) return acc;
        acc.push({
          key, roomText: p.building ? `${p.building} ${p.room}` : r.room || "",
          label: (p.building ? `${p.building} ${p.room}` : r.room || "") + " (已退租)",
          tenantId: "", tenantName: r.tenant || "已退租", rent: 0, archived: true
        });
        return acc;
      }, []);
    return [...fromTenants, ...fromRecords]
      .filter((x) => x.roomText)
      .sort((a, b) => a.roomText.localeCompare(b.roomText, "zh-Hans-CN", { numeric: true }));
  }, [tenants, records]);

  async function handleSheetImage(file) {
    if (!file) return;
    setParsing(true);
    try {
      const uploaded = await uploadFile(file);
      const task = await createMeterTask({
        upload: uploaded.url,
        building: sheetBuilding,
        cycle: sheetCycle,
        meterDate: sheetDate,
      });
      setMeterTaskId(task.id);
      setSheetReadings(Array.isArray(task.readings) ? task.readings : []);
      setSheetInfo(`任务 ${task.id}，识别 ${Array.isArray(task.readings) ? task.readings.length : 0} 条`);
      setError("");
    } catch (e) {
      setError(e.message || "抄表识别失败");
      setSheetInfo("");
    } finally {
      setParsing(false);
    }
  }

  function updateReading(index, patch) {
    setSheetReadings((prev) => prev.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  }

  async function handleConfirmTask() {
    if (!meterTaskId) {
      setError("请先上传抄表图片");
      return;
    }
    setConfirming(true);
    try {
      const result = await confirmMeterTask(meterTaskId, {
        readings: sheetReadings.map((x) => ({ ...x, confirmed: true })),
      });
      const nextReadings = result?.task?.readings || [];
      setSheetReadings(nextReadings);
      if (result?.hasBlocking) {
        setError("存在异常读数，请修正后再确认");
      } else {
        setError("");
        setSheetInfo(`任务 ${meterTaskId} 已确认`);
      }
    } catch (e) {
      setError(e.message || "确认失败");
    } finally {
      setConfirming(false);
    }
  }

  async function handleGenerateBills() {
    setGenerating(true);
    try {
      const result = await generateBillsFromReadings({
        cycle: sheetCycle,
        meterDate: sheetDate,
        dueDate: `${sheetCycle}-05`,
        meterTaskId,
        readings: sheetReadings,
      });
      const r = await fetchRecords();
      setRecords(r || []);
      setError(`生成 ${result.generatedCount} 条，跳过 ${result.skippedCount} 条`);
    } catch (e) {
      setError(e.message || "生成账单失败");
    } finally {
      setGenerating(false);
    }
  }

  async function loadMessages() {
    setLoadingMessages(true);
    try {
      const list = await fetchWechatMessages(sheetCycle);
      setWechatMessages(Array.isArray(list) ? list : []);
      setError("");
    } catch (e) {
      setError(e.message || "加载微信消息失败");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function copyAndMark(item) {
    try {
      await navigator.clipboard.writeText(item.content || "");
      await markBillSent(item.recordId, {
        status: "sent",
        targetGroup: item.groupName || item.remark || "",
      });
      setWechatMessages((prev) => prev.map((x) => (x.recordId === item.recordId ? { ...x, status: "sent", sentAt: new Date().toISOString() } : x)));
      setRecords((prev) => prev.map((x) => (x.id === item.recordId ? { ...x, sentStatus: "sent", sentAt: new Date().toISOString() } : x)));
    } catch (e) {
      setError(e.message || "复制失败");
    }
  }

  function openCreate() {
    setEditing(null);
    setWaterMinimumEdited(false);
    setForm(defaultForm());
    setFormOpen(true);
  }

  function openEdit(item) {
    const norm = (v) => String(v || "").replace(/\s+/g, "").replace(/[A-Za-z]/g, "").trim();
    const matchedTenant =
      tenants.find((t) => t.id === item.tenantId) ||
      tenants.find((t) => String(t.name || "").trim() === String(item.tenant || "").trim() && norm(`${t.building || ""}${t.room || ""}`) === norm(item.room || "")) ||
      tenants.find((t) => String(t.name || "").trim() === String(item.tenant || "").trim());

    setEditing(item);
    setWaterMinimumEdited(false);
    setForm({
      tenant: item.tenant || "",
      tenantId: matchedTenant?.id || item.tenantId || "",
      room: item.room || "",
      cycle: item.cycle || new Date().toISOString().slice(0, 7),
      rentPart: String(item.rentPart ?? matchedTenant?.rent ?? ""),
      receivable: String(item.receivable ?? 0),
      received: String(item.received ?? 0),
      status: item.status || "未收",
      method: item.method || "微信",
      paidAt: (item.paidAt && item.paidAt !== "-") ? item.paidAt : "",
      dueDate: item.dueDate || `${new Date().toISOString().slice(0, 7)}-10`,
      note: item.note || "",
      electricPrev: String(item.electricPrev ?? ""),
      electricNow: String(item.electricNow ?? ""),
      electricUsage: String(item.electricUsage ?? ""),
      electricPrice: String(item.electricPrice ?? ""),
      waterPrev: String(item.waterPrev ?? ""),
      waterNow: String(item.waterNow ?? ""),
      waterUsage: String(item.waterUsage ?? ""),
      waterPrice: String(item.waterPrice ?? ""),
      waterMinimumCharge: String(item.waterMinimumCharge ?? 0),
      propertyFee: String(item.propertyFee ?? 0),
      networkFee: String(item.networkFee ?? 0),
      garbageFee: String(item.garbageFee ?? 0),
      miscFee: String(item.miscFee ?? item.otherFee ?? 0),
      otherFee: String(item.otherFee ?? 0),
      depositAdjustment: String(item.depositAdjustment ?? 0),
      noWaterMeter: Boolean(item.noWaterMeter),
      tenantStartDate: matchedTenant?.leaseStart || "",
    });
    setFormOpen(true);
  }

  function applyTenant(tenantId) {
    const t = tenants.find((x) => x.id === tenantId);
    if (!t) return;
    const room = t.building ? `${t.building} ${t.room || ""}` : t.room || "";
    setForm((prev) => ({
      ...prev,
      tenantId: t.id,
      tenant: t.name || "",
      room,
      rentPart: String(Number(t.rent || 0)),
      receivable: String(Number(t.rent || 0)),
      tenantStartDate: t.leaseStart || "",
    }));
  }

  function applyRoom(roomKey, targetCycle) {
    const selected = roomOptions.find((x) => x.key === roomKey);
    if (!selected) return;
    const tenant = tenants.find((t) => t.id === selected.tenantId);
    const feeDefaults = getTenantFeeDefaults(tenant);
    // 找目标账期之前的最近一条记录（而非全局最新），避免补录历史月份时读数错位
    const cycle = targetCycle || form.cycle || new Date().toISOString().slice(0, 7);
    const roomMatchKey = normalizeRoomMatch(selected.roomText);
    const prevRecords = (records || [])
      .filter((r) => normalizeRoomMatch(r.room) === roomMatchKey && String(r.cycle || "") < cycle)
      .sort((a, b) => String(b.cycle || "").localeCompare(String(a.cycle || "")));
    const last = prevRecords[0] || null;
    const electricPrev = last?.electricNow ?? feeDefaults.electricInitial ?? "";
    const waterPrev = last?.waterNow ?? feeDefaults.waterInitial ?? "";
    const matchedProp = (properties || []).find((p) => makeRoomKey(p.building, p.room) === selected.key);
    setForm((prev) => recalcReceivable(applyOtherFeeParts(applyMeterAutoFields({
      ...prev,
      tenantId: selected.tenantId,
      tenant: selected.tenantName,
      room: selected.roomText,
      noWaterMeter: Boolean(matchedProp?.noWaterMeter),
      rentPart: String(selected.rent || 0),
      receivable: String(selected.rent || 0),
      electricPrev: String(electricPrev),
      waterPrev: String(waterPrev),
      electricPrice: pickMinPrice(last?.electricPrice ?? feeDefaults.electricPrice ?? prev.electricPrice, DEFAULT_ELECTRIC_PRICE),
      waterPrice: pickMinPrice(last?.waterPrice ?? feeDefaults.waterPrice ?? prev.waterPrice, DEFAULT_WATER_PRICE),
      propertyFee: String(feeDefaults.propertyFee ?? prev.propertyFee ?? "0"),
      networkFee: String(feeDefaults.networkFee ?? prev.networkFee ?? "0"),
      garbageFee: String(feeDefaults.garbageFee ?? prev.garbageFee ?? "0"),
      miscFee: String(feeDefaults.miscFee ?? prev.miscFee ?? "0"),
      tenantStartDate: tenant?.leaseStart || "",
    }))));
  }

  useEffect(() => {
    if (!formOpen || form.tenantId) return;
    const name = String(form.tenant || "").trim();
    if (!name) return;
    const matched = tenants.find((t) => String(t.name || "").trim() === name);
    if (!matched) return;
    setForm((prev) => ({
      ...prev,
      tenantId: matched.id,
      tenantStartDate: matched.leaseStart || "",
    }));
  }, [formOpen, form.tenantId, form.tenant, tenants]);

  function openQuickPay(item) {
    setQuickPayTarget(item);
  }

  async function saveRecord() {
    try {
      const usageMap = new Map(
        (properties || []).map((p) => [makeRoomKey(p.building, p.room), String(p.usageType || "")]),
      );
      const tenant = form.tenantId ? tenants.find((t) => t.id === form.tenantId) : null;
      const fromTenantKey = tenant ? makeRoomKey(tenant.building, tenant.room) : "";
      const parsedRoom = parseRoomText(form.room);
      const fromRoomTextKey = parsedRoom.building ? makeRoomKey(parsedRoom.building, parsedRoom.room) : "";
      const usageType = usageMap.get(fromTenantKey) || usageMap.get(fromRoomTextKey) || "";
      if (usageType === "自用（不出租）") {
        setError("该房间为自用（不出租），不能创建或保存收租账单");
        return;
      }
      const computed = recalcReceivable(applyOtherFeeParts(applyMeterAutoFields(form, form.waterMinimumCharge)));
      const payload = {
        ...(editing || {}),
        ...computed,
        rentPart: Number(computed.rentPart || 0),
        receivable: Number(computed.receivable || 0),
        received: Number(computed.received || 0),
        electricPrev: Number(computed.electricPrev || 0),
        electricNow: Number(computed.electricNow || 0),
        electricUsage: Number(computed.electricUsage || 0),
        electricPrice: Number(computed.electricPrice || 0),
        waterPrev: Number(computed.waterPrev || 0),
        waterNow: Number(computed.waterNow || 0),
        waterUsage: Number(computed.waterUsage || 0),
        waterPrice: Number(computed.waterPrice || 0),
        waterMinimumCharge: Number(computed.waterMinimumCharge || 0),
        propertyFee: Number(computed.propertyFee || 0),
        networkFee: Number(computed.networkFee || 0),
        garbageFee: Number(computed.garbageFee || 0),
        miscFee: Number(computed.miscFee || 0),
        otherFee: Number(computed.otherFee || 0),
        depositAdjustment: Number(computed.depositAdjustment || 0),
        noWaterMeter: Boolean(form.noWaterMeter),
        paidAt: String(form.paidAt || "").trim() || "-",
      };
      // 自动修正状态
      const recvAmt = Number(payload.received || 0);
      const dueAmt = Number(payload.receivable || 0);
      if (dueAmt > 0 && recvAmt >= dueAmt) {
        payload.status = "已收";
      } else if (recvAmt > 0) {
        payload.status = "部份收取";
      } else {
        payload.status = "未收";
      }
      if (apiEnabled) {
        const saved = editing ? await updateRecord(editing.id, payload) : await createRecord(payload);
        setRecords((prev) => (editing ? prev.map((x) => (x.id === editing.id ? saved : x)) : [saved, ...prev]));
      } else {
        const local = { ...payload, id: editing?.id || `rec-local-${Date.now()}` };
        setRecords((prev) => (editing ? prev.map((x) => (x.id === editing.id ? local : x)) : [local, ...prev]));
      }
      setFormOpen(false);
      setError("");
    } catch (e) {
      setError(e.message || "保存失败");
    }
  }

  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", tone: "danger", onConfirm: null });
  function openConfirm(title, message, onConfirm, tone = "danger") { setConfirmState({ open: true, title, message, tone, onConfirm }); }
  function closeConfirm() { setConfirmState({ open: false, title: "", message: "", tone: "danger", onConfirm: null }); }

  async function removeRecord(item) {
    openConfirm("删除账单", `确认删除：${item.tenant || "-"} / ${item.room || "-"}`, async () => {
      closeConfirm();
      try {
        if (apiEnabled) await deleteRecord(item.id);
        setRecords((prev) => prev.filter((x) => x.id !== item.id));
      } catch (e) { setError(e.message || "删除失败"); }
    });
  }

  async function clearAll() {
    openConfirm("清空账单", "确认清空全部账单吗？此操作不可撤销。", async () => {
      closeConfirm();
      try {
        if (apiEnabled) await clearRecords();
        setRecords([]);
      } catch (e) { setError(e.message || "清空失败"); }
    });
  }

  async function handleMeterCsvImport(file) {
    try {
      const text = await file.text();
      // 尝试从文件名推断账期: meter_2026-05.csv
      const nameMatch = String(file.name || "").match(/(\d{4}-\d{2})/);
      const guessedCycle = nameMatch ? nameMatch[1] : (sheetCycle || new Date().toISOString().slice(0, 7));
      const confirmedCycle = window.prompt("导入到哪个账期？\n\n（文件名推断：" + guessedCycle + "）", guessedCycle);
      if (!confirmedCycle || !/^\d{4}-\d{2}$/.test(confirmedCycle)) { setError("已取消：请输入有效账期格式 YYYY-MM"); return; }
      const cycle = confirmedCycle;
      setSheetCycle(cycle);
      const lines = text.replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setError("CSV 格式不正确，至少需要标题行+1行数据"); return; }
      const header = lines[0].split(",").map(h => h.trim());
      const bi = header.indexOf("building"), ri = header.indexOf("room"), ei = header.indexOf("electricNow"), wi = header.indexOf("waterNow");
      if (ri < 0) { setError("CSV 缺少 room 列"); return; }
      const dataRows = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim());
        return {
          building: bi >= 0 ? cols[bi] : "", room: cols[ri],
          electricNow: ei >= 0 ? cols[ei] : "", waterNow: wi >= 0 ? cols[wi] : ""
        };
      }).filter(r => r.room && (r.electricNow || r.waterNow));
      if (!dataRows.length) { setError("CSV 无有效数据行"); return; }
      const roomKeyMap = new Map();
      roomOptions.forEach(o => { roomKeyMap.set(normalizeRoomMatch(o.roomText), o); });
      const feeDefaults = new Map();
      tenants.forEach(t => { feeDefaults.set(t.id, getTenantFeeDefaults(t)); });
      let updated = 0, created = 0;
      for (const row of dataRows) {
        const rk = normalizeRoomMatch(row.building + " " + row.room);
        const opt = roomKeyMap.get(rk);
        if (!opt) continue;
        const existing = (records || []).find(r => normalizeRoomMatch(r.room) === rk && String(r.cycle || "").trim() === cycle);
        const tenant = tenants.find(t => t.id === opt.tenantId);
        const fees = feeDefaults.get(opt.tenantId) || {};
        const lastRec = (records || []).filter(r => normalizeRoomMatch(r.room) === rk && String(r.cycle || "") < cycle).sort((a, b) => String(b.cycle || "").localeCompare(String(a.cycle || "")))[0] || null;
        const prop = (properties || []).find(p => makeRoomKey(p.building, p.room) === opt.key);
        const payload = {
          tenant: opt.tenantName, tenantId: opt.tenantId, room: opt.roomText,
          building: row.building, cycle, rentPart: opt.rent, receivable: opt.rent, received: existing ? (existing.received || 0) : 0,
          payments: existing ? (existing.payments || []) : [],
          status: existing ? (existing.status || "未收") : "未收", method: "微信",
          dueDate: cycle + "-10", paidAt: existing ? (existing.paidAt || "-") : "-",
          note: "手机抄表导入",
          electricPrev: String(lastRec?.electricNow ?? fees.electricInitial ?? ""),
          electricNow: String(row.electricNow || (existing ? existing.electricNow : "")),
          electricPrice: String(lastRec?.electricPrice ?? fees.electricPrice ?? "0.8"),
          waterPrev: String(lastRec?.waterNow ?? fees.waterInitial ?? ""),
          waterNow: String(row.waterNow || (existing ? existing.waterNow : "")),
          waterPrice: String(lastRec?.waterPrice ?? fees.waterPrice ?? "5.5"),
          noWaterMeter: Boolean(prop?.noWaterMeter),
          propertyFee: String(fees.propertyFee ?? "0"),
          networkFee: String(fees.networkFee ?? "0"),
          garbageFee: String(fees.garbageFee ?? "0"),
        };
        // Auto-calc usage
        payload.electricUsage = String(Math.max(0, Number(payload.electricNow) - Number(payload.electricPrev)));
        payload.waterUsage = String(Math.max(0, Number(payload.waterNow) - Number(payload.waterPrev)));
        const wPrice = Number(payload.waterPrice);
        const wUsage = Number(payload.waterUsage);
        payload.waterMinimumCharge = String(payload.noWaterMeter ? 0 : (wUsage < 1 ? Math.round(((1 - wUsage) * (Number.isFinite(wPrice) ? wPrice : 0)) * 100) / 100 : 0));
        payload.otherFee = String(Number(payload.propertyFee) + Number(payload.networkFee) + Number(payload.garbageFee));
        payload.receivable = String(Math.round(Number(payload.rentPart) + Number(payload.electricUsage) * Number(payload.electricPrice) + Number(payload.waterUsage) * Number(payload.waterPrice) + Number(payload.waterMinimumCharge) + Number(payload.otherFee)));
        // Auto status
        const recvAmt = Number(payload.received || 0);
        const dueAmt = Number(payload.receivable || 0);
        if (dueAmt > 0 && recvAmt >= dueAmt) payload.status = "已收";
        else if (recvAmt > 0) payload.status = "部份收取";
        else payload.status = "未收";

        if (existing) {
          await updateRecord(existing.id, { ...existing, ...payload, id: existing.id });
          updated++;
        } else {
          await createRecord(payload);
          created++;
        }
      }
      // 补全：为 CSV 中没有的在租房间，自动生成租金账单
      const importedRoomKeys = new Set(dataRows.map(r => normalizeRoomMatch(r.building + " " + r.room)));
      let autoFilled = 0;
      for (const opt of roomOptions) {
        if (importedRoomKeys.has(opt.key)) continue;
        const existing = (records || []).find(r => normalizeRoomMatch(r.room) === opt.key && String(r.cycle || "").trim() === cycle);
        if (existing) continue;
        const tenant = tenants.find(t => t.id === opt.tenantId);
        const fees = getTenantFeeDefaults(tenant);
        const prop = (properties || []).find(p => makeRoomKey(p.building, p.room) === opt.key);
        const lastRec = (records || []).filter(r => normalizeRoomMatch(r.room) === opt.key && String(r.cycle || "") < cycle).sort((a, b) => String(b.cycle || "").localeCompare(String(a.cycle || "")))[0] || null;
        const rent = opt.rent;
        const otherFee = Number(fees.propertyFee ?? 0) + Number(fees.networkFee ?? 0) + Number(fees.garbageFee ?? 0);
        const payload = {
          tenant: opt.tenantName, tenantId: opt.tenantId, room: opt.roomText,
          building: opt.roomText.split(" ")[0] || "", cycle, rentPart: rent,
          receivable: String(rent + otherFee), received: 0, payments: [],
          status: "未收", method: "微信", dueDate: cycle + "-10", paidAt: "-", note: "CSV导入自动补全",
          electricPrev: String(lastRec?.electricNow ?? fees.electricInitial ?? ""),
          electricNow: String(lastRec?.electricNow ?? fees.electricInitial ?? ""),
          electricUsage: "0", electricPrice: String(fees.electricPrice ?? "0.8"),
          waterPrev: String(lastRec?.waterNow ?? fees.waterInitial ?? ""),
          waterNow: String(lastRec?.waterNow ?? fees.waterInitial ?? ""),
          waterUsage: "0", waterPrice: String(fees.waterPrice ?? "5.5"),
          waterMinimumCharge: "0", noWaterMeter: Boolean(prop?.noWaterMeter),
          propertyFee: String(fees.propertyFee ?? "0"), networkFee: String(fees.networkFee ?? "0"), garbageFee: String(fees.garbageFee ?? "0"),
          otherFee: String(otherFee), depositAdjustment: "0",
        };
        await createRecord(payload);
        autoFilled++;
      }
      // Refresh records
      const newRecords = await queryClient.invalidateQueries({ queryKey: ["records"] }).then(() => fetchRecords());
      setRecords(Array.isArray(newRecords) ? newRecords : []);
      const msg = `导入完成：更新 ${updated} 条，新建 ${created} 条`;
      setError(autoFilled > 0 ? msg + `，自动补全 ${autoFilled} 条租金账单` : msg);
    } catch (e) { setError(e.message || "CSV 导入失败"); }
  }

  async function generateBillImages() {
    const cycle = sheetCycle || new Date().toISOString().slice(0,7);
    const cycleRecords = records.filter(r => String(r.cycle||"").trim()===cycle);
    if (!cycleRecords.length) { setError(`${cycle} 没有账单`); return; }
    setGeneratingImages(true);
    setBillImages([]);
    const imgs = [];
    // Create a hidden container
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:400px;";
    document.body.appendChild(container);

    const sorted = [...cycleRecords].sort((a,b)=>{
      const bc=String(a.room||"").localeCompare(String(b.room||""),"zh-Hans-CN",{numeric:true});
      return bc;
    });
    for (const item of sorted) {
      const paid = Array.isArray(item.payments) ? item.payments.reduce((s,p)=>s+Number(p.amount||0),0) : Number(item.received||0);
      const unpaid = Math.max(0, Number(item.receivable||0) - paid);
      const eAmt = Math.round(Number(item.electricUsage||0) * Number(item.electricPrice||0));
      const wAmt = Math.round(Number(item.waterUsage||0) * Number(item.waterPrice||0) + Number(item.waterMinimumCharge||0));
      const hasMeter = Number(item.electricUsage||0) > 0 || Number(item.waterUsage||0) > 0 || Number(item.electricPrev||0) > 0 || Number(item.waterPrev||0) > 0;
      const esc = (s) => { const d = document.createElement("div"); d.appendChild(document.createTextNode(String(s ?? ""))); return d.innerHTML; };

      const card = document.createElement("div");
      card.style.cssText = "width:400px;background:#fff;border-radius:16px;overflow:hidden;font-family:'Microsoft YaHei',sans-serif;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.08)";
      card.innerHTML = `
        <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:16px 18px">
          <div style="font-size:12px;opacity:.8">收租账单 · ${cycle}</div>
          <div style="font-size:21px;font-weight:bold;margin-top:2px">${esc(item.room||"-")}</div>
          <div style="font-size:16px;margin-top:1px">${esc(item.tenant||"-")}</div>
        </div>
        <div style="padding:14px 18px">
          ${hasMeter ? `<div style="border-left:3px solid #e2e8f0;padding-left:12px;margin-bottom:8px">
            ${Number(item.electricUsage||0)>0||Number(item.electricPrev||0)>0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:2px 0"><span>⚡ 电表</span><span>${item.electricPrev||0} → ${item.electricNow||0} (${item.electricUsage||0}度)</span><span style="font-weight:bold;color:#1e293b">¥${eAmt}</span></div>`:""}
            ${Number(item.waterUsage||0)>0||Number(item.waterPrev||0)>0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:2px 0"><span>💧 水表</span><span>${item.waterPrev||0} → ${item.waterNow||0} (${item.waterUsage||0}方)</span><span style="font-weight:bold;color:#1e293b">¥${wAmt}</span></div>`:""}
            ${Number(item.waterMinimumCharge||0)>0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;padding:2px 0"><span>水费保底</span><span>¥${Number(item.waterMinimumCharge||0).toFixed(2)}</span></div>`:""}
          </div>`:""}
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">租金</span><span style="font-weight:500">¥${Number(item.rentPart||0).toFixed(0)}</span></div>
          ${Number(item.garbageFee||0)>0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">税费</span><span style="font-weight:500">¥${Number(item.garbageFee||0).toFixed(0)}</span></div>`:""}
          ${Number(item.networkFee||0)>0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">宽带费</span><span style="font-weight:500">¥${Number(item.networkFee||0).toFixed(0)}</span></div>`:""}
          ${Number(item.propertyFee||0)>0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">物业费</span><span style="font-weight:500">¥${Number(item.propertyFee||0).toFixed(0)}</span></div>`:""}
          <div style="background:#f0fdf4;border-radius:10px;padding:10px;margin-top:8px;text-align:center">
            <div style="font-size:11px;color:#64748b">本期应收</div>
            <div style="font-size:26px;font-weight:bold;color:#16a34a">¥${Number(item.receivable||0).toFixed(0)}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:#94a3b8;text-align:center">到期日：${esc(item.dueDate||"-")} · ${esc(item.method||"微信")}</div>
          ${unpaid>0 ? `<div style="margin-top:4px;font-size:12px;color:#ef4444;text-align:center;font-weight:bold">未收 ¥${unpaid.toFixed(0)}</div>`:""}
        </div>
        <div style="background:#f8fafc;padding:8px;text-align:center;font-size:10px;color:#94a3b8">收租佬系统</div>
      `;
      container.appendChild(card);
      try {
        const dataUrl = await toPng(card, { pixelRatio: 2, backgroundColor: "#fff" });
        const textContent = [
          `收租账单 · ${cycle}`,
          `房号：${item.room||"-"}`,
          `租客：${item.tenant||"-"}`,
          `租金：${Number(item.rentPart||0).toFixed(0)}`,
          `电费：${eAmt.toFixed(2)}（${item.electricUsage||0}×${item.electricPrice||0}）`,
          `水费：${wAmt.toFixed(2)}（${item.waterUsage||0}×${item.waterPrice||0}）`,
          Number(item.garbageFee||0)>0?`税费：${Number(item.garbageFee||0).toFixed(0)}`:'',
          Number(item.networkFee||0)>0?`宽带费：${Number(item.networkFee||0).toFixed(0)}`:'',
          `本期应收：${Number(item.receivable||0).toFixed(0)}`,
          `到期日：${item.dueDate||"-"}`,
        ].filter(Boolean).join('\n');
        imgs.push({ id: item.id, tenant: item.tenant, room: item.room, dataUrl, text: textContent });
      } catch(e) { console.error("Image gen failed:", e); }
      container.removeChild(card);
    }
    document.body.removeChild(container);
    setBillImages(imgs);
    setGeneratingImages(false);
    setError(`已生成 ${imgs.length} 张账单图片，长按图片可保存或转发`);
  }

  function printBill(item) {
    const fmt = (v) => Number(v || 0).toFixed(2);
    const n = (v) => Number(v || 0);
    const electricAmount = n(item.electricUsage) * n(item.electricPrice);
    const waterAmount = n(item.waterUsage) * n(item.waterPrice);
    const payQrUrl = String(printPayQrUrl || localStorage.getItem("income-print-pay-qr") || "").trim();
    const qrHtml = payQrUrl
      ? `<img src="${payQrUrl}" alt="收款码" style="width:88px;height:88px;border-radius:8px;object-fit:cover;border:1px solid #cbd5e1;" />`
      : `<div class="qr-box">二维码占位</div>`;
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>租金账单 - ${item.tenant || "-"}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body { font-family: "Microsoft YaHei", Arial, sans-serif; color:#0f172a; margin:0; background:#fff; }
    .page { width: 100%; min-height: 100%; border:1px solid #cbd5e1; border-radius:12px; padding:16px; }
    .header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:16px; }
    .title { font-size:26px; font-weight:700; }
    .sub { font-size:12px; color:#64748b; }
    .card { border:1px solid #cbd5e1; border-radius:10px; padding:14px; margin-bottom:12px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; font-size:14px; }
    .label { color:#475569; }
    table { width:100%; border-collapse:collapse; margin-top:10px; font-size:14px; }
    th,td { border:1px solid #cbd5e1; padding:8px; text-align:left; }
    th { background:#f8fafc; }
    .total { font-size:18px; font-weight:700; text-align:right; margin-top:12px; }
    .footer { margin-top:22px; display:flex; justify-content:space-between; font-size:13px; color:#64748b; align-items:flex-end; }
    .sign { margin-top:28px; display:grid; grid-template-columns:repeat(3,1fr); gap:18px; font-size:13px; color:#334155; }
    .sign-line { border-top:1px solid #94a3b8; padding-top:8px; min-height:30px; }
    .qr-box { width:88px; height:88px; border:1px dashed #94a3b8; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:11px; color:#64748b; }
    .print-btn { position: fixed; right: 24px; top: 16px; padding:8px 14px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; }
    @media print { .print-btn { display:none; } .page { border:none; border-radius:0; padding:0; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">打印</button>
  <div class="page">
    <div class="header">
      <div class="title">租金账单</div>
      <div class="sub">打印时间：${new Date().toLocaleString("zh-CN")}</div>
    </div>

    <div class="card">
      <div class="grid">
        <div><span class="label">租客：</span>${item.tenant || "-"}</div>
        <div><span class="label">房号：</span>${item.room || "-"}</div>
        <div><span class="label">账期：</span>${item.cycle || "-"}</div>
        <div><span class="label">到期日：</span>${item.dueDate || "-"}</div>
        <div><span class="label">状态：</span>${item.status || "未收"}</div>
        <div><span class="label">收款方式：</span>${item.method || "-"}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>项目</th><th>金额（元）</th><th>计算说明</th></tr></thead>
      <tbody>
        <tr><td>租金</td><td>${fmt(item.rentPart)}</td><td>基础租金</td></tr>
        <tr><td>电费</td><td>${fmt(electricAmount)}</td><td>${item.electricUsage ?? 0} 度 × ${item.electricPrice ?? 0} 元</td></tr>
        <tr><td>水费</td><td>${fmt(waterAmount)}</td><td>${item.waterUsage ?? 0} 方 × ${item.waterPrice ?? 0} 元</td></tr>
        <tr><td>水费保底</td><td>${fmt(item.waterMinimumCharge)}</td><td>当月用水为 0 时可启用</td></tr>
        <tr><td>其他费用</td><td>${fmt(item.otherFee)}</td><td>导入或手动录入</td></tr>
        <tr><td>押金调整</td><td>${fmt(item.depositAdjustment)}</td><td>退租或补缴调整</td></tr>
      </tbody>
    </table>

    <table>
      <thead><tr><th>类型</th><th>上月</th><th>本月</th><th>用量</th><th>单价</th><th>金额</th></tr></thead>
      <tbody>
        <tr><td>电表</td><td>${item.electricPrev ?? 0}</td><td>${item.electricNow ?? 0}</td><td>${item.electricUsage ?? 0}</td><td>${item.electricPrice ?? 0}</td><td>${fmt(electricAmount)}</td></tr>
        <tr><td>水表</td><td>${item.waterPrev ?? 0}</td><td>${item.waterNow ?? 0}</td><td>${item.waterUsage ?? 0}</td><td>${item.waterPrice ?? 0}</td><td>${fmt(waterAmount)}</td></tr>
      </tbody>
    </table>

    <table>
      <thead><tr><th>项目</th><th>数值</th><th>项目</th><th>数值</th></tr></thead>
      <tbody>
        <tr><td>上月电表</td><td>${item.electricPrev ?? 0}</td><td>本月电表</td><td>${item.electricNow ?? 0}</td></tr>
        <tr><td>电表实用</td><td>${item.electricUsage ?? 0}</td><td>电费单价</td><td>${item.electricPrice ?? 0}</td></tr>
        <tr><td>上月水表</td><td>${item.waterPrev ?? 0}</td><td>本月水表</td><td>${item.waterNow ?? 0}</td></tr>
        <tr><td>水表实用</td><td>${item.waterUsage ?? 0}</td><td>水费单价</td><td>${item.waterPrice ?? 0}</td></tr>
        <tr><td>水费保底</td><td>${fmt(item.waterMinimumCharge)}</td><td>其他费用</td><td>${fmt(item.otherFee)}</td></tr>
        <tr><td>租金</td><td>${fmt(item.rentPart)}</td><td>押金</td><td>${fmt(item.depositAdjustment)}</td></tr>
      </tbody>
    </table>

    <div class="total">本期应收：${fmt(item.receivable)} 元　已收：${fmt(item.received)} 元</div>
    <div class="sign">
      <div class="sign-line">租客签名：</div>
      <div class="sign-line">收款人签名：</div>
      <div class="sign-line">日期：</div>
    </div>

    <div class="footer">
      <div>备注：${item.note || "-"}</div>
      <div style="display:flex;align-items:flex-end;gap:10px;">
        <div>系统：本地收租管理系统</div>
        ${qrHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
    const w = window.open("about:blank", "_blank", "width=980,height=760");
    if (!w) {
      setError("打印窗口被浏览器拦截，请允许 localhost 弹窗后重试");
      return;
    }
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try {
          w.print();
        } catch (_) {
          // ignore
        }
      }, 180);
    } catch (e) {
      setError(`打印页渲染失败：${e?.message || "未知错误"}`);
    }
  }

  function buildBillMessage(item) {
    const money = (v) => Number(v || 0).toFixed(2);
    const intMoney = (v) => String(Math.round(Number(v || 0)));
    const cycleText = String(item.cycle || "-");
    const cycleMonthText = /^\d{4}-\d{2}$/.test(cycleText) ? `${cycleText}月` : cycleText;
    const lines = [
      `周期：${cycleMonthText}`,
      `房号：${item.room || "-"}`,
      `租客姓名：${item.tenant || "-"}`,
      `租金：${intMoney(item.rentPart)}`,
      `电费：${money(Number(item.electricUsage || 0) * Number(item.electricPrice || 0))}（${item.electricUsage || 0}×${item.electricPrice || 0}）`,
      `水费：${money(Number(item.waterUsage || 0) * Number(item.waterPrice || 0))}（${item.waterUsage || 0}×${item.waterPrice || 0}）`,
    ];
    if (Number(item.waterMinimumCharge || 0) !== 0) lines.push(`水费保底：${money(item.waterMinimumCharge)}`);
    if (Number(item.otherFee || 0) !== 0) lines.push(`其他费用：${money(item.otherFee)}`);
    if (Number(item.depositAdjustment || 0) !== 0) lines.push(`押金调整：${money(item.depositAdjustment)}`);
    lines.push(`本期应收：${intMoney(item.receivable)}`);
    return lines.join("\n");
  }

  async function copyBillMessage(item) {
    try {
      // Copy text
      const text = buildBillMessage(item);
      await navigator.clipboard.writeText(text);
      // Generate card image in background
      const eAmt = Math.round(Number(item.electricUsage||0) * Number(item.electricPrice||0));
      const wAmt = Math.round(Number(item.waterUsage||0) * Number(item.waterPrice||0) + Number(item.waterMinimumCharge||0));
      const hasMeter = Number(item.electricUsage||0)>0||Number(item.waterUsage||0)>0||Number(item.electricPrev||0)>0||Number(item.waterPrev||0)>0;
      const cycle = item.cycle || new Date().toISOString().slice(0,7);
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;width:400px;";
      document.body.appendChild(container);
      const esc = (s) => { const d = document.createElement("div"); d.appendChild(document.createTextNode(String(s ?? ""))); return d.innerHTML; };

      const card = document.createElement("div");
      card.style.cssText = "width:400px;background:#fff;border-radius:16px;overflow:hidden;font-family:'Microsoft YaHei',sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.08)";
      card.innerHTML = `<div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:16px 18px"><div style="font-size:12px;opacity:.8">收租账单 · ${cycle}</div><div style="font-size:21px;font-weight:bold;margin-top:2px">${esc(item.room||"-")}</div><div style="font-size:16px;margin-top:1px">${esc(item.tenant||"-")}</div></div><div style="padding:14px 18px">${hasMeter?`<div style="border-left:3px solid #e2e8f0;padding-left:12px;margin-bottom:8px">${Number(item.electricUsage||0)>0||Number(item.electricPrev||0)>0?`<div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:2px 0"><span>电表</span><span>${item.electricPrev||0}→${item.electricNow||0}(${item.electricUsage||0}度)</span><span style="font-weight:bold;color:#1e293b">¥${eAmt}</span></div>`:""}${Number(item.waterUsage||0)>0||Number(item.waterPrev||0)>0?`<div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:2px 0"><span>水表</span><span>${item.waterPrev||0}→${item.waterNow||0}(${item.waterUsage||0}方)</span><span style="font-weight:bold;color:#1e293b">¥${wAmt}</span></div>`:""}</div>`:""}<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">租金</span><span style="font-weight:500">¥${Number(item.rentPart||0).toFixed(0)}</span></div>${Number(item.garbageFee||0)>0?`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">税费</span><span style="font-weight:500">¥${Number(item.garbageFee||0).toFixed(0)}</span></div>`:""}<div style="background:#f0fdf4;border-radius:10px;padding:10px;margin-top:8px;text-align:center"><div style="font-size:11px;color:#64748b">本期应收</div><div style="font-size:26px;font-weight:bold;color:#16a34a">¥${Number(item.receivable||0).toFixed(0)}</div></div><div style="margin-top:6px;font-size:11px;color:#94a3b8;text-align:center">到期日：${item.dueDate||"-"} · ${item.method||"微信"}</div></div><div style="background:#f8fafc;padding:8px;text-align:center;font-size:10px;color:#94a3b8">收租佬系统</div>`;
      container.appendChild(card);
      const dataUrl = await toPng(card, { pixelRatio: 2, backgroundColor: "#fff" });
      container.removeChild(card);
      document.body.removeChild(container);
      setSingleCard({ id: item.id, tenant: item.tenant, room: item.room, dataUrl, text });
      setError("文字已复制到剪贴板，图片已生成");
    } catch (e) {
      setError(e.message || "生成失败");
    }
  }

  async function markSent(item) {
    try {
      const payload = {
        status: "sent",
        targetGroup: item.groupName || item.remark || item.tenant || "",
      };
      if (apiEnabled) await markBillSent(item.id, payload);
      const sentAt = new Date().toISOString();
      setRecords((prev) => prev.map((x) => (x.id === item.id ? { ...x, sentStatus: "sent", sentAt } : x)));
      setError("已标记为已发送");
    } catch (e) {
      setError(e.message || "标记发送失败");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-3 mb-2"><div className="rounded-xl bg-rose-100 p-2.5 text-rose-700"><FileClock className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-slate-900">收租账单</h1><p className="text-sm text-slate-500">应收 {formatCurrency(totals.receivable)}，已收 {formatCurrency(totals.received)}，未收 {formatCurrency(totals.unpaid)}</p></div></div>
        {error ? <p className="mt-2 text-sm text-amber-700">{error}</p> : null}
        {backendHint ? <p className="mt-2 text-sm text-amber-700">{backendHint}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-xl border border-sky-200 px-3 py-2 text-sm" type="button" onClick={openCreate}>新增账单</button>
          <button className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700" type="button" onClick={clearAll}>清空账单</button>
          <button className="rounded-xl border border-pink-200 px-3 py-2 text-sm text-pink-700" type="button" onClick={generateBillImages} disabled={generatingImages}><Image className="inline h-4 w-4 mr-1" />{generatingImages ? "生成中..." : "生成账单图片"}</button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">账单列表</h2>
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
            <option value="all">全部房号</option>
            {roomOptions.map((x) => <option key={x.key} value={x.key}>{x.label || x.roomText}</option>)}
          </select>
        </div>
        {loading ? <p className="mt-2 text-sm text-slate-500">加载中...</p> : null}
        <div className="mt-2 text-xs text-slate-500">提示：列表为精简视图，完整字段请在"编辑"或"打印"查看。</div>
        {/* 手机端：卡片视图 */}
        <div className="mt-3 grid gap-3 sm:hidden">
          {sortedRecords.filter(r => roomFilter === "all" || (() => { const p = parseRoomText(r.room||""); return makeRoomKey(p.building, p.room); })() === roomFilter).map((item) => (
            <div key={item.id} className={`rounded-xl border p-3 ${flashRowId === item.id ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <div><span className="font-bold text-sm">{item.room||"-"}</span><span className="text-xs text-slate-400 ml-2">{item.cycle||"-"}</span></div>
                <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusTone(item.status||"未收")}`} type="button" onClick={() => openQuickPay(item)}>{item.status||"未收"}</button>
              </div>
              <div className="mt-1 text-xs text-slate-500">{item.tenant||"-"}</div>
              <div className="mt-2 flex items-center justify-between">
                <div><span className="text-xs text-slate-500">应收</span> <span className="font-bold text-sm">{formatCurrency(item.receivable||0)}</span></div>
                <div><span className="text-xs text-slate-500">已收</span> <span className="font-bold text-sm">{formatCurrency(item.received||0)}</span></div>
                <div className="text-xs text-slate-400">{formatDate((Array.isArray(item.payments)&&item.payments.length>0)?item.payments[item.payments.length-1].paidAt:(item.paidAt&&item.paidAt!=="-"?item.paidAt:""))||"-"}</div>
              </div>
              {(Number(item.electricUsage||0)>0||Number(item.waterUsage||0)>0) && (
                <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2">
                  {Number(item.electricUsage||0)>0 && <div>电 {item.electricPrev}→{item.electricNow} ({item.electricUsage}度) ¥{Math.round(Number(item.electricUsage||0)*Number(item.electricPrice||0))}</div>}
                  {Number(item.waterUsage||0)>0 && <div>水 {item.waterPrev}→{item.waterNow} ({item.waterUsage}方) ¥{Math.round(Number(item.waterUsage||0)*Number(item.waterPrice||0)+Number(item.waterMinimumCharge||0))}</div>}
                </div>
              )}
              {Number(item.garbageFee||0)>0 && <div className="mt-1 text-[11px] text-slate-500">税费 {formatCurrency(item.garbageFee||0)}</div>}
              {Number(item.networkFee||0)>0 && <div className="mt-1 text-[11px] text-slate-500">宽带费 {formatCurrency(item.networkFee||0)}</div>}
              <div className="mt-2 flex gap-1.5">
                <button className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs" type="button" onClick={() => copyBillMessage(item)}>复制</button>
                <button className="flex-1 rounded-lg border border-sky-200 py-1.5 text-xs" type="button" onClick={() => openEdit(item)}>编辑</button>
                <button className="flex-1 rounded-lg border border-rose-200 py-1.5 text-xs text-rose-600" type="button" onClick={() => removeRecord(item)}>删除</button>
              </div>
            </div>
          ))}
        </div>

        {/* 桌面端：表格视图 */}
        <div className="mt-3 overflow-x-auto rounded-xl border border-sky-100 hidden sm:block">
          <table className="min-w-[1240px] text-xs md:text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-2 text-left">房号</th>
                <th className="px-2 py-2 text-left">租客</th>
                <th className="px-2 py-2 text-left">周期</th>
                <th className="px-2 py-2 text-left">应收</th>
                <th className="px-2 py-2 text-left">已收</th>
                <th className="px-2 py-2 text-left">水电</th>
                <th className="px-2 py-2 text-left">分项</th>
                <th className="px-2 py-2 text-left">状态</th>
                <th className="px-2 py-2 text-left">收款日</th>
                <th className="px-2 py-2 text-left">发送</th>
                <th className="px-2 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.filter(r => roomFilter === "all" || (() => { const p = parseRoomText(r.room||""); return makeRoomKey(p.building, p.room); })() === roomFilter).map((item) => (
                <tr key={item.id} className={`border-t border-sky-50 transition-colors duration-300 ${flashRowId === item.id ? "bg-emerald-50" : ""}`}>
                  <td className="px-2 py-2 whitespace-nowrap">{item.room || "-"} {!activeTenantKeys.has(makeRoomKey((()=>{const p=parseRoomText(item.room||"");return p.building;})(), (()=>{const p=parseRoomText(item.room||"");return p.room;})())) && <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1">已退租</span>}</td>
                  <td className="px-2 py-2 whitespace-nowrap font-medium">{item.tenant || "-"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{item.cycle || "-"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatCurrency(item.receivable || 0)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatCurrency(item.received || 0)}</td>
                  <td className="px-2 py-2 text-xs text-slate-600">
                    {(Number(item.electricUsage || 0) > 0 || Number(item.electricPrev || 0) > 0) && (
                      <div className="flex items-center gap-1"><span className="text-amber-600 font-medium w-4">电</span><span>{item.electricPrev ?? 0}→{item.electricNow ?? 0}</span><span className="text-slate-400">({item.electricUsage ?? 0}度)</span><span className="text-slate-400">@{item.electricPrice ?? 0}</span><span className="ml-auto font-medium">¥{Math.round(Number(item.electricUsage||0)*Number(item.electricPrice||0))}</span></div>
                    )}
                    {(Number(item.waterUsage || 0) > 0 || Number(item.waterPrev || 0) > 0) && (
                      <div className="flex items-center gap-1"><span className="text-sky-600 font-medium w-4">水</span><span>{item.waterPrev ?? 0}→{item.waterNow ?? 0}</span><span className="text-slate-400">({item.waterUsage ?? 0}方)</span><span className="text-slate-400">@{item.waterPrice ?? 0}</span><span className="ml-auto font-medium">¥{Math.round(Number(item.waterUsage||0)*Number(item.waterPrice||0)+Number(item.waterMinimumCharge||0))}</span></div>
                    )}
                    {!Number(item.electricUsage||0) && !Number(item.waterUsage||0) && !Number(item.electricPrev||0) && !Number(item.waterPrev||0) && <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">
                    <div>租金 {formatCurrency(item.rentPart||0)}</div>
                    {(Number(item.waterMinimumCharge||0) > 0) && <div>保底 +{formatCurrency(item.waterMinimumCharge||0)}</div>}
                    {(Number(item.garbageFee||0) > 0) && <div>税费 {formatCurrency(item.garbageFee||0)}</div>}
                    {(Number(item.networkFee||0) > 0) && <div>宽带费 {formatCurrency(item.networkFee||0)}</div>}
                    {(Number(item.depositAdjustment||0) !== 0) && <div>押金 {formatCurrency(item.depositAdjustment||0)}</div>}
                  </td>
                  <td className="px-2 py-2"><button className={`rounded px-2 py-1 text-xs cursor-pointer ${getStatusTone(item.status || "未收")}`} type="button" onClick={() => openQuickPay(item)} title="点击收款">{item.status || "未收"}</button></td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatDate((Array.isArray(item.payments)&&item.payments.length>0) ? item.payments[item.payments.length-1].paidAt : (item.paidAt && item.paidAt !== "-" ? item.paidAt : "")) || "-"}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-1 text-xs ${item.sentStatus === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {item.sentStatus === "sent" ? "已发" : "待发"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700" type="button" onClick={() => copyBillMessage(item)}>复制账单</button>
                      <button className="rounded-lg border border-emerald-300 px-2.5 py-1 text-emerald-700" type="button" onClick={() => markSent(item)}>标记已发</button>
                      <button className="rounded-lg border border-slate-300 px-2.5 py-1" type="button" onClick={() => printBill(item)}>打印</button>
                      <button className="rounded border border-sky-200 px-2 py-1" type="button" onClick={() => openEdit(item)}>编辑</button>
                      <button className="rounded-lg border border-rose-300 px-2.5 py-1 text-rose-700" type="button" onClick={() => removeRecord(item)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 my-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-xl font-semibold">{editing ? "编辑账单" : "新增账单"}</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">房号
                {(roomOptions.some(x => x.tenantId === form.tenantId) || roomOptions.some(x => normalizeKey(x.roomText) === normalizeKey(form.room))) ? (
                <select
                  className="mt-1 w-full rounded border border-sky-200 px-2 py-2"
                  value={
                    roomOptions.find((x) => x.tenantId === form.tenantId)?.key
                    || roomOptions.find((x) => normalizeKey(x.roomText) === normalizeKey(form.room))?.key
                    || ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    applyRoom(v);
                  }}
                >
                  <option value="">选择房号</option>
                  {roomOptions.map((x) => <option key={x.key} value={x.key}>{x.label || x.roomText}</option>)}
                </select>
                ) : (
                <input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2 text-sm text-slate-500" value={form.room + " (已退租)"} readOnly />
                )}
              </label>
              <label className="text-sm">租客姓名<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.tenant} readOnly /></label>
              <label className="text-sm">周期<input type="month" className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.cycle} onChange={(e) => setForm((p) => ({ ...p, cycle: e.target.value, dueDate: e.target.value ? `${e.target.value}-10` : p.dueDate }))} /></label>
              <label className="text-sm">租金<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.rentPart} onChange={(e) => setForm((p) => recalcReceivable({ ...p, rentPart: e.target.value }))} /></label>
              <label className="text-sm">应收<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.receivable} readOnly /></label>
              <label className="text-sm">已收<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.received} onChange={(e) => setForm((p) => ({ ...p, received: e.target.value }))} /></label>
              <label className="text-sm">状态
                <select className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="未收">未收</option>
                  <option value="部份收取">部份收取</option>
                  <option value="已收">已收</option>
                  <option value="逾期">逾期</option>
                </select>
              </label>
              <label className="text-sm">收款方式<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value || "微信" }))} /></label>
              <label className="text-sm">到期日<input type="date" className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
              <label className="text-sm">收款日期<input type="date" className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.paidAt || ""} onChange={(e) => setForm((p) => ({ ...p, paidAt: e.target.value }))} /></label>
              <label className="text-sm">上月电表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.electricPrev} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts(applyMeterAutoFields({ ...p, electricPrev: e.target.value }, waterMinimumEdited ? p.waterMinimumCharge : undefined))))} /></label>
              <label className="text-sm">本月电表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.electricNow} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts(applyMeterAutoFields({ ...p, electricNow: e.target.value }, waterMinimumEdited ? p.waterMinimumCharge : undefined))))} /></label>
              <label className="text-sm">电费单价<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.electricPrice} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, electricPrice: e.target.value })))} /></label>
              <label className="text-sm">电表实用读数<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.electricUsage} readOnly /></label>
              <label className="text-sm">上月水表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterPrev} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts(applyMeterAutoFields({ ...p, waterPrev: e.target.value }, waterMinimumEdited ? p.waterMinimumCharge : undefined))))} /></label>
              <label className="text-sm">本月水表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterNow} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts(applyMeterAutoFields({ ...p, waterNow: e.target.value }, waterMinimumEdited ? p.waterMinimumCharge : undefined))))} /></label>
              <label className="text-sm">水费单价<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterPrice} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, waterPrice: e.target.value })))} /></label>
              <label className="text-sm">水表实用读数<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.waterUsage} readOnly /></label>
              <label className="text-sm">水费保底<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterMinimumCharge} onChange={(e) => { setWaterMinimumEdited(true); setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, waterMinimumCharge: e.target.value }))); }} /></label>
              <label className="text-sm">物业管理费<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.propertyFee} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, propertyFee: e.target.value })))} /></label>
              <label className="text-sm">宽带费<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.networkFee} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, networkFee: e.target.value })))} /></label>
              <label className="text-sm">税费<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.garbageFee} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, garbageFee: e.target.value })))} /></label>
              <label className="text-sm">其他费用（明细）<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.miscFee} onChange={(e) => setForm((p) => recalcReceivable(applyOtherFeeParts({ ...p, miscFee: e.target.value })))} /></label>
              <label className="text-sm">其他费用（合计）<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.otherFee} readOnly /></label>
              <label className="text-sm">押金<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.depositAdjustment} onChange={(e) => setForm((p) => recalcReceivable({ ...p, depositAdjustment: e.target.value }))} /></label>
              <div className="md:col-span-2 rounded border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-slate-700">
                <div>导入分项：租金 {Number(editing?.rentPart || 0).toFixed(2)}，其他费 {Number(editing?.otherFee || 0).toFixed(2)}，押金调整 {Number(editing?.depositAdjustment || 0).toFixed(2)}</div>
                <div>水费保底（当月用水为 0 时）: {Number(editing?.waterMinimumCharge || 0).toFixed(2)}</div>
              </div>
              <label className="text-sm md:col-span-2">备注<textarea className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-sky-200 px-3 py-2" type="button" onClick={() => setFormOpen(false)}>取消</button>
              <button className="rounded bg-sky-700 px-3 py-2 text-white" type="button" onClick={saveRecord}>保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {quickPayTarget ? (
        <QuickPayModal
          target={quickPayTarget}
          onClose={() => setQuickPayTarget(null)}
          onConfirm={async ({ amount, method, date, note }) => {
            const paid = Array.isArray(quickPayTarget.payments) ? quickPayTarget.payments.reduce((s, p) => s + Number(p.amount || 0), 0) : Number(quickPayTarget.received || 0);
            const newPaid = paid + amount;
            const payments = Array.isArray(quickPayTarget.payments) ? [...quickPayTarget.payments] : [];
            payments.push({ id: `pay-${Date.now()}`, amount, paidAt: date, method, note });
            const payload = { ...quickPayTarget, payments, received: newPaid, paidAt: date };
            if (Number(payload.receivable || 0) > 0 && newPaid >= Number(payload.receivable || 0)) payload.status = "已收";
            else if (newPaid > 0) payload.status = "部份收取";
            const saved = await updateRecord(quickPayTarget.id, payload);
            setRecords((prev) => prev.map((x) => (x.id === quickPayTarget.id ? saved : x)));
            setQuickPayTarget(null);
            setFlashRowId(quickPayTarget.id);
            setTimeout(() => setFlashRowId(""), 1500);
          }}
        />
      ) : null}

      {singleCard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSingleCard(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{singleCard.room} · {singleCard.tenant}</span>
              <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs" type="button" onClick={() => setSingleCard(null)}>✕</button>
            </div>
            <img src={singleCard.dataUrl} alt={singleCard.tenant} className="w-full rounded-xl" />
            <pre className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 whitespace-pre-wrap">{singleCard.text}</pre>
            <div className="mt-2 flex gap-2">
              <button className="flex-1 rounded-xl bg-slate-600 py-2 text-sm text-white font-medium" type="button" onClick={() => { navigator.clipboard.writeText(singleCard.text); }}>📋 复制文字</button>
              <a className="flex-1 rounded-xl bg-blue-600 py-2 text-center text-sm text-white font-medium no-underline" href={singleCard.dataUrl} download={`账单_${singleCard.tenant}_${singleCard.room}.png`}>💾 保存图片</a>
            </div>
          </div>
        </div>
      ) : null}

      {billImages.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <div className="my-4 w-full max-w-md space-y-3">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-2xl bg-white p-3 shadow-lg">
              <h3 className="font-semibold">账单图片（{billImages.length} 张）</h3>
              <button className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm" type="button" onClick={() => setBillImages([])}>关闭</button>
            </div>
            {billImages.map((img, i) => (
              <div key={img.id} className="rounded-2xl bg-white p-3 shadow-lg">
                <div className="mb-2 text-sm font-medium text-slate-700">{i+1}. {img.room} · {img.tenant}</div>
                <img src={img.dataUrl} alt={img.tenant} className="w-full rounded-xl" />
                <pre className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 whitespace-pre-wrap">{img.text}</pre>
                <div className="mt-2 flex gap-2">
                  <button className="flex-1 rounded-xl bg-slate-600 py-2 text-center text-sm text-white font-medium" type="button" onClick={() => { navigator.clipboard.writeText(img.text); }}>📋 复制文字</button>
                  <a className="flex-1 rounded-xl bg-blue-600 py-2 text-center text-sm text-white font-medium no-underline" href={img.dataUrl} download={`账单_${img.tenant}_${img.room}.png`}>💾 保存图片</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ConfirmDialog open={confirmState.open} title={confirmState.title} message={confirmState.message} tone={confirmState.tone} onCancel={closeConfirm} onConfirm={() => { const fn = confirmState.onConfirm; if (typeof fn === "function") fn(); }} />
    </div>
  );
};

export default RentRecordsPage;

