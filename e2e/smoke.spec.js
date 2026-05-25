import { test, expect } from "@playwright/test";

const API_BASE = "https://api.income.ccwu.cc";
const TEST_USER = "morefun886";
const TEST_PASS = "Mf848886#";

// ---- Frontend smoke tests -------------------------------------------------

test.describe("Frontend (income.ccwu.cc)", () => {
  test("首页重定向到登录页", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    // HashRouter → URL 應包含 #/login
    await expect(page).toHaveURL(/#\/login/);
  });

  test("登录页面渲染正常", async ({ page }) => {
    await page.goto("/#/login");
    // 檢查關鍵 UI 元素
    await expect(page.locator("text=收租佬系统")).toBeVisible();
    await expect(page.locator("text=登录系统")).toBeVisible();
    await expect(page.locator("input#username")).toBeVisible();
    await expect(page.locator("input#password")).toBeVisible();
  });

  test("API 狀態指示燈顯示已連接", async ({ page }) => {
    await page.goto("/#/login");
    await expect(page.locator("text=NAS 后端已连接")).toBeVisible();
  });
});

// ---- API smoke tests ------------------------------------------------------

test.describe("API (api.income.ccwu.cc)", () => {
  test("GET /api/health 回 200", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /api/auth/login 正確密碼回 token", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: TEST_USER, password: TEST_PASS },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.token).toBe("string");
  });

  test("POST /api/auth/login 錯誤密碼回 401", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: TEST_USER, password: "wrong-password" },
    });
    expect(res.status()).toBe(401);
  });

  test("無 token 存取 /api/properties 回 401", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/properties`);
    expect(res.status()).toBe(401);
  });
});

// ---- Login flow E2E -------------------------------------------------------

test.describe("登入流程", () => {
  test("正確帳密登入後跳轉 dashboard", async ({ page }) => {
    await page.goto("/#/login");
    await page.fill("input#username", TEST_USER);
    await page.fill("input#password", TEST_PASS);
    await page.click("button[type=submit]");

    // 成功登入後應跳轉到 dashboard
    await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10000 });
    await expect(page.locator("text=首页工作台")).toBeVisible({ timeout: 10000 });
  });

  test("錯誤密碼顯示錯誤訊息", async ({ page }) => {
    await page.goto("/#/login");
    await page.fill("input#username", TEST_USER);
    await page.fill("input#password", "wrong-password");
    await page.click("button[type=submit]");

    // 應顯示錯誤
    await expect(page.locator(".bg-rose-50, .text-rose-700").first()).toBeVisible({ timeout: 5000 });
  });

  test("登入後可存取 dashboard 資料", async ({ page }) => {
    await page.goto("/#/login");
    await page.fill("input#username", TEST_USER);
    await page.fill("input#password", TEST_PASS);
    await page.click("button[type=submit]");
    await page.waitForURL(/#\/dashboard/, { timeout: 10000 });

    // Dashboard 應顯示數據
    await expect(page.getByRole("heading", { name: "快捷入口" })).toBeVisible({ timeout: 10000 });
  });
});
