/**
 * 加密工具模块
 * 提供 HMAC-SHA256 签名验证和 OAuth2 PKCE 参数生成
 */

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * 验证 Hub 推送的 webhook 签名
 * 签名算法: HMAC-SHA256(secret, timestamp + ":" + body)
 * 对比格式: "sha256=" + hex
 *
 * @param secret    - webhook_secret
 * @param timestamp - 请求头中的时间戳字符串
 * @param body      - 原始请求体
 * @param signature - 请求头中携带的签名（"sha256=" + hex 编码）
 * @returns 签名是否合法
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected =
    "sha256=" +
    createHmac("sha256", secret)
      .update(`${timestamp}:${body}`)
      .digest("hex");

  // 长度不一致直接拒绝，避免 timingSafeEqual 抛异常
  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, "utf-8"),
    Buffer.from(signature, "utf-8"),
  );
}

/**
 * 生成 PKCE 参数（code_verifier + code_challenge）
 * 符合 RFC 7636 规范
 *
 * @returns { codeVerifier, codeChallenge }
 *   - codeVerifier: base64url 编码的随机字符串
 *   - codeChallenge: SHA256(codeVerifier) 的 base64url 编码
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // 生成 base64url 编码的随机 code_verifier
  const codeVerifier = randomBytes(32).toString("base64url");

  // code_challenge = BASE64URL(SHA256(code_verifier))
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}
