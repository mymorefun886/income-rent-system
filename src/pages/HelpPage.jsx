import React from "react";
import { BookOpen, Calendar, FileText, Home, Lightbulb, PenLine, Phone, Wallet } from "lucide-react";

const steps = [
  { icon: Home, title: "房产档案", desc: "录入楼栋和房号，设置租金、户型、水电表、无用水标志。" },
  { icon: Phone, title: "租客档案", desc: "录入租客信息，设置费用项（抄表/固定/一次性），绑定房号。" },
  { icon: Calendar, title: "月度收租", desc: "每月初点「生成缺失账单」一次搞定全月账单，水电读数自动继承上月。" },
  { icon: PenLine, title: "抄表录入", desc: "手机下载抄表页 → 填读数 → 导出 CSV → 回家导入，无需 OCR。" },
  { icon: Wallet, title: "快速收款", desc: "账单列表点状态标签 → 弹窗收全款或部分收款，自动记录。" },
  { icon: FileText, title: "发送账单", desc: "点「生成账单图片」→ 图片+文字一键发送给租客微信。" },
];

const tips = [
  "💡 每月10号前生成当月账单，统一到期日。",
  "💡 修改账单后状态会自动修正（已收/未收/部份收取）。",
  "💡 自用房在房产档案设为「自用（不出租）」即可隐藏。",
  "💡 工场无用水在房产档案勾选「无用水」开关。",
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><BookOpen className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">使用指南</h1>
            <p className="text-sm text-slate-500">个人房东收租操作流程</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <article key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><s.icon className="h-5 w-5" /></div>
            <h3 className="font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{s.desc}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4 text-amber-500" /><h2 className="font-semibold text-slate-900">小贴士</h2></div>
        <div className="space-y-2">
          {tips.map((t, i) => <div key={i} className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">{t}</div>)}
        </div>
      </section>
    </div>
  );
}
