import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const HASH_PREFIX = 'sha256$';

/** 生成随机盐（十六进制字符串）。 */
export function createSalt(byteLength = 16): string {
  return randomBytes(byteLength).toString('hex');
}

/** 加盐 SHA-256，产物形如 `sha256$<hex>`。 */
export function hashPassword(password: string, salt: string): string {
  const digest = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${HASH_PREFIX}${digest}`;
}

/** 常量时间比较，避免按字节提前返回。 */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'utf8');
  const expected = Buffer.from(expectedHash ?? '', 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
