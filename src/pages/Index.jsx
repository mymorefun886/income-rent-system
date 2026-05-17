import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  Cloud,
  Database,
  LockKeyhole,
  Search,
} from "lucide-react";
import { deploymentBlueprint, helpSections, landingHighlights } from "../lib/mock-data";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#caf0f8_0%,#e7faff_36%,#f4fdff_100%)]">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.12fr_0.88fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-[#03457e] shadow-sm ring-1 ring-[#ade8f4]">
              <Search className="h-4 w-4" />
              严格参照房东利器进行本地化设计
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              本地化收租系统方案
              <span className="block bg-[linear-gradient(90deg,#023e8a,#0096c7)] bg-clip-text text-transparent">
                Cloudflare 前端 + NAS Docker 后端
              </span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
              这套前端以简体中文为主，首页工作台、房产管理、租客档案、收租台账和帮助文档都按房东利器的使用习惯重组。
              前端适配 `income.ccwu.cc`，后端数据、图片、合同和登录接口预留给本地绿联云 NAS。
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(90deg,#03457e,#0077b6)] px-6 py-3 text-base font-medium text-white transition hover:brightness-110"
                onClick={() => navigate("/login")}
                type="button"
              >
                进入登录页
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#ade8f4] bg-white px-6 py-3 text-base font-medium text-[#03457e] transition hover:bg-[#f3fcff]"
                onClick={() => navigate("/help")}
                type="button"
              >
                查看帮助文档
                <BookOpenCheck className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-[36px] bg-white p-6 shadow-xl ring-1 ring-[#ade8f4]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-[linear-gradient(145deg,#023e8a,#0077b6)] p-5 text-white">
                <Cloud className="h-5 w-5" />
                <h2 className="mt-4 text-xl font-semibold">前端部署</h2>
                <p className="mt-2 text-sm leading-6 text-white/85">
                  Cloudflare Pages / Workers
                  <br />
                  域名: income.ccwu.cc
                </p>
              </div>
              <div className="rounded-3xl bg-[#caf0f8] p-5 text-[#023e8a]">
                <Database className="h-5 w-5" />
                <h2 className="mt-4 text-xl font-semibold">后端与存储</h2>
                <p className="mt-2 text-sm leading-6 text-[#03457e]/80">
                  绿联云 NAS Docker
                  <br />
                  结构化数据 + 图片 + 合同
                </p>
              </div>
              <div className="rounded-3xl bg-[linear-gradient(145deg,#0096c7,#48cae4)] p-5 text-white sm:col-span-2">
                <LockKeyhole className="h-5 w-5" />
                <h2 className="mt-4 text-xl font-semibold">账号密码登录</h2>
                <p className="mt-2 text-sm leading-6 text-white/85">
                  前端已保留登录入口和演示账号，接入 NAS API 后即可切换为本地真实鉴权，并继续补充短信验证码、角色权限和操作日志。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {landingHighlights.map((item) => (
            <article
              key={item.title}
              className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-[#ade8f4]"
            >
              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
        {helpSections.map((section) => (
          <article key={section.title} className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-[#ade8f4]">
            <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{section.body}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[36px] bg-[linear-gradient(135deg,#023e8a,#0077b6)] px-6 py-8 text-white shadow-xl">
          <h3 className="text-2xl font-semibold">部署蓝图</h3>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {deploymentBlueprint.map((block) => (
              <div key={block.title} className="rounded-[28px] bg-white/8 p-5 ring-1 ring-white/12">
                <h4 className="text-lg font-medium">{block.title}</h4>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-white/80">
                  {block.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
