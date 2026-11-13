/** trim 后按上限截断，非字符串一律视为空。前后端共用同一套清洗语义。 */
export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
