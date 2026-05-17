import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, KeyRound, User } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiEnabled } from "../lib/api";
import { loginGuide } from "../lib/mock-data";

const LoginPage = () => {
  const [username, setUsername] = useState(loginGuide.defaultUsername);
  const [password, setPassword] = useState(loginGuide.defaultPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await login(username, password);
    if (result.success) navigate("/dashboard");
    else setError(result.message);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-200">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">收租佬系统</h1>
          <p className="mt-1 text-sm text-slate-500">个人房东租赁管理</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}

            {/* Account field */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="username">登录账号</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  id="username"
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入登录账号"
                  type="text"
                  value={username}
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="password">登录密码</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-12 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  id="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
              type="submit"
            >
              {loading ? "验证中..." : "登录系统"}
            </button>
          </form>

          {/* NAS status */}
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${apiEnabled ? "bg-green-500" : "bg-amber-500"}`} />
            {apiEnabled ? "NAS 后端已连接" : "本地模式"}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">数据存储于 NAS Docker · 本地优先</p>
      </div>
    </div>
  );
};

export default LoginPage;
