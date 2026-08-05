import { FORMAT_LABELS } from '../constants/formats';

const FORMAT_ALIASES = {
  jpg: 'jpeg',
  tif: 'tiff',
};

const MIME_FORMATS = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/bmp': 'BMP',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/svg+xml': 'SVG',
  'image/tiff': 'TIFF',
  'image/webp': 'WebP',
  'text/csv': 'CSV',
};

const PREVIEWABLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

function getExtension(fileName = '') {
  return String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/i)?.[1] || '';
}

export function appendUniqueFiles(currentFiles, incomingFiles) {
  const files = Array.from(currentFiles || []);
  const seen = new Set(files);
  let duplicateCount = 0;

  Array.from(incomingFiles || []).forEach((file) => {
    if (seen.has(file)) {
      duplicateCount += 1;
      return;
    }
    seen.add(file);
    files.push(file);
  });

  return {
    addedCount: files.length - Array.from(currentFiles || []).length,
    duplicateCount,
    files,
  };
}

export function getBasicQueueError(files) {
  const queuedFiles = Array.from(files || []);
  if (queuedFiles.some((file) => !(file instanceof Blob))) {
    return 'Не удалось прочитать один или несколько выбранных файлов.';
  }
  if (queuedFiles.some((file) => file.size === 0)) {
    return 'Пустые файлы нельзя добавить в очередь.';
  }
  return '';
}

export function getFileFormatLabel(file, detectedFormat = '') {
  const rawDetected = String(detectedFormat || '').toLowerCase();
  const detected = FORMAT_ALIASES[rawDetected] || rawDetected;
  if (FORMAT_LABELS[detected]) return FORMAT_LABELS[detected];
  const rawExtension = getExtension(file?.name);
  const extension = FORMAT_ALIASES[rawExtension] || rawExtension;
  if (FORMAT_LABELS[extension]) return FORMAT_LABELS[extension];
  const mime = String(file?.type || '').split(';', 1)[0].toLowerCase();
  return MIME_FORMATS[mime] || 'Файл';
}

export function isFilePreviewable(file, detectedFormat = '') {
  const rawDetected = String(detectedFormat || '').toLowerCase();
  const detected = FORMAT_ALIASES[rawDetected] || rawDetected;
  const rawExtension = getExtension(file?.name);
  const extension = FORMAT_ALIASES[rawExtension] || rawExtension;
  const mime = String(file?.type || '').split(';', 1)[0].toLowerCase();
  if (detected) return PREVIEWABLE_FORMATS.has(detected);
  return PREVIEWABLE_FORMATS.has(extension)
    || ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
}
