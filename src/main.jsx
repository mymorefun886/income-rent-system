import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { reportClientError } from "./lib/api";
import "./index.css";

window.addEventListener("error", (event) => {
  reportClientError({
    message: event.message || "window.error",
    stack: event.error?.stack || "",
    page: window.location.href,
    meta: { source: event.filename || "", line: event.lineno || 0, column: event.colno || 0 },
  }).catch(() => {});
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason || {};
  reportClientError({
    message: String(reason?.message || reason || "unhandledrejection"),
    stack: String(reason?.stack || ""),
    page: window.location.href,
    meta: { type: "unhandledrejection" },
  }).catch(() => {});
});

ReactDOM.createRoot(document.getElementById("root")).render(
    <App />
);
