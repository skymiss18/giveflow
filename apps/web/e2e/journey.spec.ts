import { expect, test, type Page } from "@playwright/test";
import type { StoreInvoice } from "../src/lib/shared/pos";

const CONFIRMED = "Confirmed on-chain.";

async function connectAs(page: Page, role: string) {
  const disconnect = page.getByRole("button", { name: "Disconnect" });
  if (await disconnect.isVisible()) await disconnect.click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: `Dev · ${role}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
}

async function go(page: Page, name: string) {
  const workspaces: Record<string, string> = {
    Merchant: "Merchant workspace", Charity: "Charity workspace",
    Admin: "Platform admin", Verifier: "Verification",
  };
  if (workspaces[name]) await page.locator("header nav summary").click();
  const link = page.locator("header nav").getByRole("link", { name: workspaces[name] ?? name, exact: true });
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`Navigation target missing: ${name}`);
  const target = new URL(href, page.url()).href;
  await link.click();
  await expect(page).toHaveURL(target, { timeout: 30_000 });
}

const confirmed = (page: Page) => expect(page.getByText(CONFIRMED).first()).toBeVisible({ timeout: 60_000 });

test.describe.serial("GiveFlow journey", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/");
  });
  test.afterAll(() => page.close());

  test("home separates the faucet tool from business navigation", async () => {
    await expect(page.getByText(/Test environment on/)).toHaveCount(0);
    await expect(page.locator("header nav a[href='/faucet']")).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "Test token faucet" })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Test token faucet" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /traceable/ })).toBeVisible();
  });

  test("merchant and charity apply", async () => {
    await connectAs(page, "Merchant");
    await go(page, "Merchant");
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByLabel("商家名称")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "商家控制台" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await connectAs(page, "Merchant");
    await page.getByLabel("Business name").fill("Lion City Learning");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("waiting for admin approval")).toBeVisible({ timeout: 60_000 });

    await connectAs(page, "Charity");
    await go(page, "Charity");
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByLabel("机构名称")).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByLabel("Organisation name").fill("Bright Steps Fund");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("waiting for admin approval")).toBeVisible({ timeout: 60_000 });
  });

  test("a non-admin cannot use the admin page", async () => {
    await go(page, "Admin");
    await expect(page.getByText("Only the platform admin wallet")).toBeVisible();
  });

  test("admin approves both and appoints a verifier", async () => {
    await connectAs(page, "Admin");
    await go(page, "Admin");
    const approve = page.getByRole("button", { name: "Approve", exact: true });
    await approve.first().click();
    await expect(page.getByText("Approved").first()).toBeVisible({ timeout: 60_000 });
    await approve.first().click();
    await expect(page.getByText("Approved")).toHaveCount(2, { timeout: 60_000 });

    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page.getByLabel("任命核验员").fill("invalid");
    await page.getByRole("button", { name: "授予权限", exact: true }).click();
    await expect(page.getByText("请输入有效地址", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.getByText("Enter a valid address", { exact: true })).toBeVisible();
    await page.getByLabel("Appoint a verifier").fill("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
    await page.getByRole("button", { name: "Grant role" }).click();
    await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible({ timeout: 60_000 });
  });

  test("charity creates a treasury and a project", async () => {
    await connectAs(page, "Charity");
    await go(page, "Charity");
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByLabel("签署人地址")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: "Create treasury" }).click();
    await expect(page.getByText("1 of 1 signers")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page.getByRole("combobox", { name: "类别", exact: true }).selectOption({ label: "教育" });
    await expect(page.getByRole("combobox", { name: "类别", exact: true })).toHaveValue("Education");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByLabel("Title").fill("Learning kits");
    await page.getByLabel("Summary").fill("Study kits for students from low-income families.");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("link", { name: /#1 Learning kits/ })).toBeVisible({ timeout: 60_000 });
  });

  test("merchant publishes a product with a donation rule", async () => {
    await connectAs(page, "Merchant");
    await go(page, "Merchant");
    await page.getByRole("button", { name: "Publish a new product" }).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByLabel("商品名称")).toBeVisible();
    await expect(page.getByLabel("捐赠规则")).toHaveValue("fixed");
    await page.getByLabel("退款期").selectOption({ label: "3 天" });
    await expect(page.getByLabel("退款期")).toHaveValue("3");
    await page.getByLabel("退款期").selectOption("0");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByLabel("Product name").fill("Education Kit");
    await expect(page.getByLabel("Charity project")).toContainText("Learning kits");
    await page.getByRole("button", { name: "Publish on-chain" }).click();
    await expect(page.getByRole("link", { name: "Education Kit" })).toBeVisible({ timeout: 60_000 });

    await page.goto("/supermarket");
    await expect(page.getByRole("img", { name: "Scan to pay" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Show payment QR" })).toHaveCount(0);
    await page.goto("/");
  });

  test("buyer funds a wallet, pays, and sees the donation proof", async () => {
    await connectAs(page, "Buyer");
    await page.getByRole("banner").getByRole("link", { name: "Test token faucet" }).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page.getByLabel("金额（最多 1,000）").fill("invalid");
    await expect(page.getByText("请输入有效金额（最多 6 位小数）")).toBeVisible();
    await page.getByLabel("金额（最多 1,000）").fill("500");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: /^Get / }).click();
    await confirmed(page);

    await go(page, "Shop");
    await expect(page.getByRole("link", { name: /Education Kit/ })).toHaveAttribute("href", "/shop/1");
    await page.goto("/shop/1");
    await connectAs(page, "Buyer");
    await expect(page.getByText("The promise, enforced by the contract")).toBeVisible();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByText("由合约执行的承诺")).toBeVisible();
    await expect(page.getByLabel("数量", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: /^Pay/ }).click();
    await expect(page.getByText("Payment confirmed.")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "View your proof" }).click();
    await expect(page.getByRole("heading", { name: "Proof of purchase and donation" })).toBeVisible();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "购买与捐赠凭证" })).toBeVisible();
    await expect(page.getByText("资金去向", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.getByText("Settled").first()).toBeVisible();
    await expect(page.getByText("1.00 mUSDC").first()).toBeVisible();
  });

  test("duplicate or invalid purchases are rejected with a readable reason", async () => {
    await go(page, "Shop");
    await page.goto("/shop/1");
    await connectAs(page, "Buyer");
    await page.getByLabel("Quantity").fill("100");
    await expect(page.getByText("Your balance:")).toBeVisible();
    // 100 × 25 mUSDC exceeds the 500 mUSDC faucet balance, so paying is blocked up-front.
    await expect(page.getByRole("button", { name: /^Pay/ })).toBeDisabled();
  });

  test("a store QR binds a fixed order and the cashier verifies its chain receipt", async ({ browser }, testInfo) => {
    await connectAs(page, "Merchant");
    await go(page, "Merchant");
    await page.getByRole("button", { name: "In-store", exact: true }).click();
    await expect(page.getByRole("img", { name: "Product QR" })).toBeVisible();
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await page.getByLabel("Store reference (optional)").fill("Supermarket-Till-02");
    const created = page.waitForResponse((response) => response.url().endsWith("/api/pos") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create payment QR" }).click();
    const response = await created;
    expect(response.status()).toBe(200);
    const invoice = await response.json() as StoreInvoice;
    expect(invoice.quantity).toBe(2);
    await expect(page.getByText("Awaiting payment", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Scan to pay" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download QR" }).click();
    expect((await download).suggestedFilename()).toBe("giveflow-payment-qr.svg");
    await page.screenshot({ path: testInfo.outputPath("cashier-desktop.png"), fullPage: true });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole("img", { name: "Scan to pay" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "门店收银", exact: true })).toBeVisible();
    await expect(page.getByText("等待付款", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("cashier-mobile-zh.png"), fullPage: true });
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });

    const customer = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await customer.goto(`/pay/${invoice.id}`);
      await expect(customer.getByRole("heading", { name: "In-store payment", exact: true })).toBeVisible();
      await connectAs(customer, "Buyer");
      await customer.getByRole("button", { name: "Continue with this wallet" }).click();
      await expect(customer.getByLabel("Quantity", { exact: true })).toHaveValue("2");
      await expect(customer.getByLabel("Quantity", { exact: true })).toBeDisabled();
      await customer.getByRole("button", { name: "中文", exact: true }).click();
      await expect(customer.getByRole("heading", { name: "门店付款", exact: true })).toBeVisible();
      expect(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await customer.screenshot({ path: testInfo.outputPath("customer-mobile-zh.png"), fullPage: true });
      await customer.getByRole("button", { name: "English", exact: true }).click();

      await connectAs(customer, "Verifier");
      await expect(customer.getByText("This payment request is assigned to another wallet", { exact: true })).toBeVisible();
      await expect(customer.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
      await connectAs(customer, "Buyer");
      await customer.getByRole("button", { name: /^Pay/ }).click();
      await expect(customer.getByRole("link", { name: "View your proof", exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Payment received", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
      const receipt = await page.request.get(`/api/pos/${invoice.id}`);
      const payment = await receipt.json();
      expect(payment.status).toBe("Payment received");
      expect(payment.order.orderHash).toBe(invoice.orderHash);
      expect(payment.order.quantity).toBe(2);
      expect(payment.order.gross).toBe("50000000");
      await customer.reload();
      await expect(customer.getByText("Payment received", { exact: true }).first()).toBeVisible();
      await expect(customer.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });

  test("wallet APP QR keeps the merchant separate and pays with the customer session", async ({}, testInfo) => {
    await connectAs(page, "Merchant");
    await go(page, "Merchant");
    await page.getByRole("button", { name: "In-store", exact: true }).click();
    await page.getByLabel("Store reference (optional)").fill("Wallet-App-Till-03");
    const created = page.waitForResponse((response) => response.url().endsWith("/api/pos") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create payment QR" }).click();
    const invoice = await (await created).json() as StoreInvoice;
    await page.getByRole("button", { name: "Wallet APP QR", exact: true }).click();
    await page.getByRole("button", { name: "Connect customer wallet", exact: true }).click();
    await expect(page.getByRole("img", { name: "Wallet APP connection QR", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disconnect customer wallet", exact: true }).click();
    await expect(page.getByRole("img", { name: "Wallet APP connection QR", exact: true })).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("giveflow:test:wallet-connect")));
    await expect(page.getByRole("button", { name: "Request payment in wallet", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Connect customer wallet", exact: true }).click();
    await expect(page.getByRole("img", { name: "Wallet APP connection QR", exact: true })).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("img", { name: "钱包 APP 连接二维码", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("wallet-app-qr-mobile-zh.png"), fullPage: true });
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.dispatchEvent(new Event("giveflow:test:wallet-connect")));
    await expect(page.getByRole("button", { name: "Request payment in wallet", exact: true })).toBeVisible();
    await expect(page.locator("header")).toContainText("0x7099");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("giveflow:test:wallet-account", {
      detail: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    })));
    await expect(page.getByText("Customer wallet changed. Scan again.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request payment in wallet", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Connect customer wallet", exact: true }).click();
    await expect(page.getByRole("img", { name: "Wallet APP connection QR", exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("giveflow:test:wallet-connect")));
    await page.evaluate(() => {
      (window as Window & { __walletRequests?: string[] }).__walletRequests = [];
      window.addEventListener("giveflow:test:wallet-request", (event) => {
        (window as Window & { __walletRequests?: string[] }).__walletRequests?.push((event as CustomEvent<string>).detail);
      });
    });
    await page.getByRole("button", { name: "Request payment in wallet", exact: true }).click();
    await expect(page.getByText("Payment received", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    const walletRequests = await page.evaluate(() => (window as Window & { __walletRequests?: string[] }).__walletRequests ?? []);
    expect(walletRequests).toContain("eth_signTypedData_v4");
    expect(walletRequests).not.toContain("eth_sendTransaction");
    await expect(page.locator("header")).toContainText("0x7099");
    const payment = await (await page.request.get(`/api/pos/${invoice.id}`)).json();
    expect(payment.order.buyer.toLowerCase()).toBe("0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc");
    expect(payment.order.merchant.toLowerCase()).toBe("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
    expect(payment.order.orderHash).toBe(invoice.orderHash);
    expect(payment.order.gross).toBe("25000000");
    await expect(page.getByRole("button", { name: "Request payment in wallet", exact: true })).toHaveCount(0);
  });

  test("charity registers evidence; verifier reviews it", async () => {
    await connectAs(page, "Charity");
    await go(page, "Charity");
    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page.getByRole("combobox", { name: "类型", exact: true }).selectOption({ label: "交付回执" });
    await expect(page.getByRole("combobox", { name: "类型", exact: true })).toHaveValue("DeliveryReceipt");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByTestId("evidence-file").setInputFiles({
      name: "receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("DEMO delivery receipt, no personal data"),
    });
    await page.getByRole("button", { name: "Upload and register on-chain" }).click();
    await expect(page.getByText("receipt.txt")).toBeVisible({ timeout: 60_000 });

    await connectAs(page, "Verifier");
    await go(page, "Verifier");
    const verify = page.getByRole("button", { name: "Verify", exact: true });
    await expect(verify).toBeDisabled();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "待核验", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("备注（选填，请勿包含个人信息）")).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Open file" }).click();
    await (await popup).close();
    await expect(verify).toBeEnabled();
    await verify.click();
    await expect(page.getByText("Verified").first()).toBeVisible({ timeout: 60_000 });
  });

  test("verifier role is enforced for outsiders", async () => {
    await connectAs(page, "Buyer");
    await go(page, "Verifier");
    await expect(page.getByText("not a verifier")).toBeVisible();
  });

  test("charity publishes a report whose hash matches the chain", async () => {
    await connectAs(page, "Charity");
    await go(page, "Charity");
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await page.getByRole("button", { name: "1. Generate snapshot" }).click();
    await page.getByRole("button", { name: "2. Publish on-chain" }).click();
    await confirmed(page);
    await page.getByRole("link", { name: "Open report" }).first().click();
    await expect(page.getByText("Integrity verified.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByText("完整性校验通过。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "打印 / 保存 PDF" })).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
  });

  test("public project page shows donations and verified evidence", async () => {
    await go(page, "Projects");
    await page.getByRole("link", { name: /Learning kits/ }).click();
    await expect(page.getByText("1/1").first()).toBeVisible();
    await expect(page.getByText("Verified").first()).toBeVisible();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByText("交付凭证", { exact: true })).toBeVisible();
  });
});
