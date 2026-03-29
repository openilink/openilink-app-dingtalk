/**
 * 加密工具模块测试
 * 验证签名验证和 PKCE 参数生成
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, generatePKCE } from "../../src/utils/crypto.js";

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const timestamp = "1700000000";
  const body = '{"type":"message","data":{}}';

  /** 计算正确的签名 */
  function computeSignature(s: string, ts: string, b: string): string {
    return createHmac("sha256", s).update(`${ts}:${b}`).digest("hex");
  }

  it("应当验证合法签名为 true", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature(secret, timestamp, body, signature)).toBe(true);
  });

  it("应当拒绝错误的签名", () => {
    expect(verifySignature(secret, timestamp, body, "invalid-signature-hex")).toBe(false);
  });

  it("应当拒绝错误的 secret", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature("wrong-secret", timestamp, body, signature)).toBe(false);
  });

  it("应当拒绝篡改后的 body", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature(secret, timestamp, '{"tampered":true}', signature)).toBe(false);
  });

  it("应当拒绝错误的时间戳", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature(secret, "9999999999", body, signature)).toBe(false);
  });

  it("应当拒绝长度不匹配的签名", () => {
    expect(verifySignature(secret, timestamp, body, "short")).toBe(false);
  });
});

describe("generatePKCE", () => {
  it("应当生成 codeVerifier 和 codeChallenge", () => {
    const pkce = generatePKCE();
    expect(pkce).toHaveProperty("codeVerifier");
    expect(pkce).toHaveProperty("codeChallenge");
  });

  it("codeVerifier 长度应在 43-128 之间", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it("codeVerifier 应为 Base64URL 格式", () => {
    const { codeVerifier } = generatePKCE();
    // Base64URL 只包含 [A-Za-z0-9_-]
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("codeChallenge 应为 Base64URL 编码的 SHA256", () => {
    const { codeChallenge } = generatePKCE();
    // SHA256 的 Base64URL 编码长度为 43 字符
    expect(codeChallenge.length).toBe(43);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("每次调用应生成不同的值", () => {
    const pkce1 = generatePKCE();
    const pkce2 = generatePKCE();
    expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
    expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
  });

  it("codeChallenge 应为 codeVerifier 的 SHA256 哈希", () => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const { createHash } = require("node:crypto");
    const expected = createHash("sha256").update(codeVerifier).digest("base64url");
    expect(codeChallenge).toBe(expected);
  });
});
