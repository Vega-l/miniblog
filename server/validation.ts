import {
  LIMITS,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  type ApiErrorCode,
} from '../shared/contract';
import { cleanText } from '../shared/text';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ApiErrorCode; message: string };

/** 中文文案沿用改造前的前端实现，避免用户可见提示发生变化。 */
export const MESSAGES = {
  username: '用户名需为 2–16 位汉字、字母、数字或下划线',
  displayName: `昵称最多 ${LIMITS.displayName} 个字符`,
  passwordMin: `密码至少 ${MIN_PASSWORD_LENGTH} 位`,
  passwordMax: `密码最多 ${LIMITS.password} 位`,
  credentialsRequired: '请输入用户名和密码',
  postContent: '请输入内容',
  commentContent: '请输入评论',
} as const;

function fail(message: string, code: ApiErrorCode = 'INVALID_INPUT'): ValidationResult<never> {
  return { ok: false, code, message };
}

function rawString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validateUsername(value: unknown): ValidationResult<string> {
  const username = rawString(value).trim();
  if (!USERNAME_PATTERN.test(username)) return fail(MESSAGES.username);
  return { ok: true, value: username };
}

/** 昵称缺省时回落为用户名。 */
export function validateDisplayName(value: unknown, fallback: string): ValidationResult<string> {
  const displayName = rawString(value).trim();
  if (displayName.length > LIMITS.displayName) return fail(MESSAGES.displayName);
  return { ok: true, value: displayName || fallback };
}

export function validatePassword(value: unknown): ValidationResult<string> {
  const password = rawString(value);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(MESSAGES.passwordMin);
  if (password.length > LIMITS.password) return fail(MESSAGES.passwordMax);
  return { ok: true, value: password };
}

export interface ContentRule {
  max: number;
  emptyMessage: string;
}

export const POST_CONTENT_RULE: ContentRule = {
  max: LIMITS.post,
  emptyMessage: MESSAGES.postContent,
};

export const COMMENT_CONTENT_RULE: ContentRule = {
  max: LIMITS.comment,
  emptyMessage: MESSAGES.commentContent,
};

export function validateContent(value: unknown, rule: ContentRule): ValidationResult<string> {
  const content = cleanText(value, rule.max);
  if (!content) return fail(rule.emptyMessage);
  return { ok: true, value: content };
}

export function validateCredentials(
  usernameValue: unknown,
  passwordValue: unknown
): ValidationResult<{ username: string; password: string }> {
  const username = rawString(usernameValue).trim();
  const password = rawString(passwordValue);
  if (!username || !password) return fail(MESSAGES.credentialsRequired);
  // 登录同样限制长度，避免超长 body 直接进入哈希
  if (password.length > LIMITS.password) return fail(MESSAGES.passwordMax);
  return { ok: true, value: { username, password } };
}
