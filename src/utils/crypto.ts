/**
 * 加密工具模块
 * 提供 HMAC-SHA256 签名验证和 OAuth2 PKCE 参数生成
 */

import { createHmac, randomBytes, createHash } from "node:crypto";

/**
 * 验证 Hub 推送的 webhook 签名
 * 签名算法: HMAC-SHA256(secret, timestamp + ":" + body)
 *
 * @param secret  - webhook_secret
 * @param timestamp - 请求头中的时间戳字符串
 * @param body    - 原始请求体
 * @param signature - 请求头中携带的签名（hex 编码）
 * @returns 签名是否合法
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${body}`)
    .digest("hex");

  // 使用恒定时间比较防止时序攻击
  if (expected.length !== signature.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 生成 PKCE 参数（code_verifier + code_challenge）
 * 符合 RFC 7636 规范
 *
 * @returns { codeVerifier, codeChallenge } — challenge 使用 S256 方法
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // 生成 43~128 字符的随机 code_verifier（Base64URL 编码）
  const codeVerifier = randomBytes(32)
    .toString("base64url")
    .slice(0, 64);

  // code_challenge = BASE64URL(SHA256(code_verifier))
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}
