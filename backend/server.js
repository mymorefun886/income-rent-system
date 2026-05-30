// ── Income Rent System Backend (Express Edition) ──
import "./lib/db.js";
import { port } from "./lib/utils.js";
import express from "express";
import cors from "cors";

// ── Route Imports ──
import authRouter from "./routes/auth.js";
import recordsRouter from "./routes/records.js";
import tenantsRouter from "./routes/tenants.js";
import propertiesRouter from "./routes/properties.js";
import expensesRouter from "./routes/expenses.js";
import contractsRouter from "./routes/contracts.js";
import meterRouter from "./routes/meter.js";
import billsRouter from "./routes/bills.js";
import backupRouter from "./routes/backup.js";
import settingsRouter from "./routes/settings.js";
import workOrdersRouter from "./routes/workOrders.js";

// ── App Setup ──
const app = express();

// Trust proxy for rate limiting IP detection
app.set("trust proxy", 1);

// CORS
const appOrigin = process.env.APP_ORIGIN || "";
const apiAllowedOrigins = String(process.env.API_ALLOWED_ORIGINS || appOrigin || (process.env.NODE_ENV === "development" ? "http://localhost:8080" : ""))
  .split(",").map(x => x.trim()).filter(Boolean);

app.use(cors({
  origin: apiAllowedOrigins.length ? apiAllowedOrigins : "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// ── Startup Checks ──
if (!process.env.JWT_SECRET) {
  console.error("❌ 错误：未设定 JWT_SECRET 环境变量");
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD_HASH) {
  console.error("❌ 错误：未设定 ADMIN_PASSWORD_HASH 环境变量");
  process.exit(1);
}

// ── Mount Routes ──
app.use(authRouter);
app.use(recordsRouter);
app.use(tenantsRouter);
app.use(propertiesRouter);
app.use(expensesRouter);
app.use(contractsRouter);
app.use(meterRouter);
app.use(billsRouter);
app.use(backupRouter);
app.use(settingsRouter);
app.use(workOrdersRouter);

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "服务器内部错误" });
});

// ── Start ──
app.listen(port, "0.0.0.0", () => {
  console.log(`=== 收租系统后端启动 ===`);
  console.log(`Listening on http://0.0.0.0:${port}`);
});
