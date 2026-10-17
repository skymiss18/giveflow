import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { formatDate, formatDuration } from "../shared/format";
import { PROJECT_CATEGORIES, EVIDENCE_KIND } from "../shared/constants";
import { formatMessage, MESSAGES, translateMessage } from "./messages";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const files = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  const filename = join(folder, entry.name);
  return entry.isDirectory() ? files(filename) : filename.endsWith(".tsx") ? [filename] : [];
});
const uiFiles = [...files(join(root, "app")), ...files(join(root, "components"))];
const english = (value: string) => /[a-zA-Z]{2}/.test(value) && !/^(mUSDC|ETH|PDF|https:\/\/|0x\.{3}|PurchaseCompleted|DonationReceived|GiveFlow)$/.test(value.trim());

describe("bilingual interface", () => {
  it("has matching catalog keys and interpolation parameters", () => {
    expect(Object.keys(MESSAGES.zh).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      expect(MESSAGES.zh[key].match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(value.match(/\{\w+\}/g)?.sort() ?? []);
    }
  });

  it("covers literal translation calls and canonical selectable values", () => {
    const missing = new Set<string>();
    for (const filename of uiFiles) {
      const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ["t", "translate", "statusLabel", "categoryLabel", "evidenceKindLabel"].includes(node.expression.getText(source))) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteral(argument) && !MESSAGES.zh[argument.text]) missing.add(argument.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    for (const value of [...PROJECT_CATEGORIES, ...EVIDENCE_KIND, "Products", "Sales", "Treasuries", "Projects", "Evidence", "Reports"]) {
      if (!MESSAGES.zh[value]) missing.add(value);
    }
    expect([...missing]).toEqual([]);
  });

  it("does not leave English JSX text or display attributes untranslated", () => {
    const missed: string[] = [];
    for (const filename of uiFiles) {
      const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) && english(node.text.replace(/\s+/g, " ").trim())) missed.push(`${filename}: ${node.text.trim()}`);
        if (ts.isJsxAttribute(node) && ["title", "subtitle", "label", "hint", "placeholder", "empty", "message", "sub"].includes(node.name.getText(source))) {
          if (node.initializer && ts.isStringLiteral(node.initializer) && english(node.initializer.text)) missed.push(`${filename}: ${node.initializer.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(missed).toEqual([]);
  });

  it("preserves canonical values when translating option labels", () => {
    for (const filename of uiFiles) {
      const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "option") {
          expect(node.openingElement.attributes.properties.some((attribute) => attribute.name?.getText(source) === "value"), filename).toBe(true);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  });

  it("translates validation errors and retains technical and user content", () => {
    expect(translateMessage("zh", "Request failed (403)")).toBe("请求失败（403）");
    expect(translateMessage("zh", "Transaction would fail: CustomError")).toBe("交易将失败：CustomError");
    expect(translateMessage("zh", "website: Invalid URL; name: Too small: expected string to have >=1 characters")).toBe("网站: 网址格式无效; 名称: 至少需要 1 个字符");
    expect(translateMessage("zh", "An original project title")).toBe("An original project title");
    expect(translateMessage("en", "{count} days", { count: 3 })).toBe("3 days");
    expect(translateMessage("zh", "{count} days", { count: 3 })).toBe("3 天");
    expect(formatMessage("{amount} {unit}", { amount: 5 })).toBe("5 {unit}");
  });

  it("formats dates and durations in Chinese without changing English defaults", () => {
    expect(formatDate(1_700_000_000, "zh-CN")).toContain("2023年");
    expect(formatDuration(3 * 86400, "zh")).toBe("3 天");
    expect(formatDuration(3600, "zh")).toBe("1 小时");
    expect(formatDuration(5, "zh")).toBe("5 秒");
    expect(formatDuration(0, "zh")).toBe("无");
    expect(formatDuration(3 * 86400)).toBe("3 days");
  });
});