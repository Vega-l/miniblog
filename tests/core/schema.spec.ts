import { describe, expect, it } from 'vitest';
import { cleanText } from '@/core/schema';

describe('cleanText', () => {
  it('去掉首尾空白并按上限截断', () => {
    expect(cleanText('  你好  ', 10)).toBe('你好');
    expect(cleanText('x'.repeat(300), 280)).toHaveLength(280);
  });

  it('非字符串一律视为空', () => {
    expect(cleanText(undefined, 10)).toBe('');
    expect(cleanText(null, 10)).toBe('');
    expect(cleanText(123, 10)).toBe('');
  });
});
