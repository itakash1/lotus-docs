export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function formatBytes(bytes) {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (!safeBytes) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : 2;
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) + ' ' + units[unitIndex];
}

export function formatPercent(value) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safeValue > 0 && safeValue < 0.1) return '<0,1%';
  return safeValue.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%';
}

export function describeSaving(original, output) {
  const saved = original - output;
  if (saved <= 0) return 'Размер не уменьшился — сохранён оригинал';
  return `Меньше на ${formatBytes(saved)} (${formatPercent(saved / original * 100)})`;
}

export function unpackProgress(value, fallbackLabel = '') {
  if (value && typeof value === 'object') {
    const raw = Number(value.progress ?? value.value ?? 0);
    return {
      percent: raw <= 1 ? raw * 100 : raw,
      label: value.message || value.label || fallbackLabel,
    };
  }
  return {
    percent: Number(value) || 0,
    label: fallbackLabel,
  };
}

export function readableError(error, fallback = 'Не удалось обработать файл.') {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/memory|allocation|too large|maximum size/i.test(message)) {
    return 'Файл слишком большой для доступной памяти браузера. Закройте лишние вкладки или обработайте файлы по одному.';
  }
  if (/unsupported|not supported|decode|format/i.test(message)) {
    return 'Браузер не смог прочитать этот файл. Проверьте формат и целостность исходника.';
  }
  if (/encrypted|password/i.test(message)) {
    return 'Защищённые паролем документы не поддерживаются. Сохраните копию без шифрования.';
  }
  return message ? fallback + ' ' + message : fallback;
}
