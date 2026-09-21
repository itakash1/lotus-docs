/**
 * Client-side file conversion primitives used by Lotus Docs.
 *
 * Optional dependencies are intentionally loaded only for the conversions that
 * need them. Install them before exposing the corresponding UI action:
 *   npm install imagetracerjs xlsx pdfmake utif
 *
 * `mammoth` is already a project dependency. No file is uploaded by this module.
 */

const KIB = 1024;
const MIB = 1024 * KIB;
const DEFAULT_MAX_FILE_SIZE = 200 * MIB;
const DEFAULT_MAX_IMAGE_PIXELS = 80_000_000;
const DEFAULT_SSIM_SAMPLE_SIZE = 256;
const DEFAULT_QUALITY_ITERATIONS = 7;

const MIME_BY_FORMAT = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  html: 'text/html;charset=utf-8',
  pdf: 'application/pdf',
});

const EXTENSION_BY_FORMAT = Object.freeze({
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  svg: 'svg',
  bmp: 'bmp',
  tiff: 'tiff',
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  json: 'json',
  html: 'html',
  pdf: 'pdf',
});

const FORMAT_ALIASES = Object.freeze({ jpg: 'jpeg', jpe: 'jpeg', tif: 'tiff', htm: 'html' });
const RASTER_FORMATS = new Set(['png', 'jpeg', 'webp']);
const RASTER_INPUT_FORMATS = new Set(['png', 'jpeg', 'webp', 'bmp', 'tiff']);
const IMAGE_INPUT_FORMATS = new Set([...RASTER_INPUT_FORMATS, 'svg']);

export const FORMAT_OPTIONS = Object.freeze([
  { value: 'png', label: 'PNG', kind: 'image', mime: MIME_BY_FORMAT.png, extensions: ['png'] },
  { value: 'jpeg', label: 'JPEG', kind: 'image', mime: MIME_BY_FORMAT.jpeg, extensions: ['jpg', 'jpeg'] },
  { value: 'webp', label: 'WebP', kind: 'image', mime: MIME_BY_FORMAT.webp, extensions: ['webp'] },
  { value: 'svg', label: 'SVG', kind: 'image', mime: MIME_BY_FORMAT.svg, extensions: ['svg'] },
  { value: 'bmp', label: 'BMP', kind: 'image', mime: MIME_BY_FORMAT.bmp, extensions: ['bmp'] },
  { value: 'tiff', label: 'TIFF', kind: 'image', mime: MIME_BY_FORMAT.tiff, extensions: ['tif', 'tiff'] },
  { value: 'docx', label: 'DOCX', kind: 'document', mime: MIME_BY_FORMAT.docx, extensions: ['docx'] },
  { value: 'xlsx', label: 'XLSX', kind: 'spreadsheet', mime: MIME_BY_FORMAT.xlsx, extensions: ['xlsx'] },
  { value: 'csv', label: 'CSV', kind: 'table', mime: MIME_BY_FORMAT.csv, extensions: ['csv'] },
  { value: 'json', label: 'JSON', kind: 'data', mime: MIME_BY_FORMAT.json, extensions: ['json'] },
  { value: 'html', label: 'HTML', kind: 'document', mime: MIME_BY_FORMAT.html, extensions: ['html'] },
  { value: 'pdf', label: 'PDF', kind: 'document', mime: MIME_BY_FORMAT.pdf, extensions: ['pdf'] },
]);

export const CONVERSION_MATRIX = Object.freeze({
  png: Object.freeze(['png', 'jpeg', 'webp', 'svg']),
  jpeg: Object.freeze(['png', 'jpeg', 'webp', 'svg']),
  webp: Object.freeze(['png', 'jpeg', 'webp', 'svg']),
  bmp: Object.freeze(['png', 'jpeg', 'webp', 'svg']),
  tiff: Object.freeze(['png', 'jpeg', 'webp', 'svg']),
  svg: Object.freeze(['png', 'jpeg', 'webp']),
  docx: Object.freeze(['html', 'pdf']),
  xlsx: Object.freeze(['csv']),
  csv: Object.freeze(['json']),
});

const MIME_TO_FORMAT = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
  ['image/webp', 'webp'],
  ['image/svg+xml', 'svg'],
  ['image/bmp', 'bmp'],
  ['image/x-ms-bmp', 'bmp'],
  ['image/tiff', 'tiff'],
  ['image/x-tiff', 'tiff'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.ms-excel', 'xlsx'],
  ['text/csv', 'csv'],
  ['application/csv', 'csv'],
]);

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const BIDI_CONTROL_CHARS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export class ConversionError extends Error {
  constructor(code, message, details = {}, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ConversionError';
    this.code = code;
    this.details = details;
    if (cause && !this.cause) this.cause = cause;
  }
}

export function normalizeFormat(format) {
  if (!format) return '';
  const normalized = String(format).trim().toLowerCase().replace(/^\./, '');
  return FORMAT_ALIASES[normalized] || normalized;
}

export function getBaseName(fileName = 'file') {
  const normalized = String(fileName || 'file').normalize('NFC');
  const withoutPath = normalized.split(/[\\/]/).pop() || 'file';
  return withoutPath.replace(/\.[^.]+$/, '') || 'file';
}

/** Keep Unicode (including Cyrillic), while removing path/control characters. */
export function sanitizeFileName(fileName = 'file', fallback = 'file') {
  let safe = String(fileName || fallback)
    .normalize('NFC')
    .replace(BIDI_CONTROL_CHARS, '')
    .replace(UNSAFE_FILE_CHARS, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();

  if (!safe || safe === '.' || safe === '..') safe = fallback;
  if (WINDOWS_RESERVED_NAMES.test(safe)) safe = `_${safe}`;

  const characters = Array.from(safe);
  if (characters.length > 180) {
    const dot = safe.lastIndexOf('.');
    const extension = dot > 0 ? safe.slice(dot) : '';
    const room = Math.max(1, 180 - Array.from(extension).length);
    safe = `${characters.slice(0, room).join('')}${extension}`;
  }
  return safe;
}

function outputFileName(file, format, suffix = '') {
  const base = sanitizeFileName(getBaseName(file?.name || 'file'));
  const extension = EXTENSION_BY_FORMAT[format] || format;
  return sanitizeFileName(`${base}${suffix}.${extension}`);
}

export function getTargetsForSource(sourceFormat) {
  const normalized = normalizeFormat(sourceFormat);
  return [...(CONVERSION_MATRIX[normalized] || [])];
}

export function isConversionSupported(sourceFormat, targetFormat) {
  return getTargetsForSource(sourceFormat).includes(normalizeFormat(targetFormat));
}

function abortError() {
  if (typeof DOMException === 'function') return new DOMException('Операция отменена.', 'AbortError');
  return new ConversionError('ABORTED', 'Операция отменена.');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function reportProgress(onProgress, progress, stage, message, extra = {}) {
  if (typeof onProgress !== 'function') return;
  const event = { ...extra, progress: Math.max(0, Math.min(1, progress)), stage, message };
  try {
    // Preferred API: onProgress({ progress: 0..1, stage, message, ... }).
    // A two-argument handler is treated as the legacy UI API and receives
    // (percent: 0..100, message, event), which keeps older screens functional.
    if (onProgress.length >= 2) onProgress(event.progress * 100, event.message, event);
    else onProgress(event);
  } catch {
    // Progress handlers must never break a conversion.
  }
}

/** Let React paint between CPU-heavy chunks. */
export async function yieldToMainThread(signal) {
  throwIfAborted(signal);
  if (globalThis.scheduler?.yield) {
    await globalThis.scheduler.yield();
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throwIfAborted(signal);
}

function assertClientApi(name, value) {
  if (!value) {
    throw new ConversionError(
      'BROWSER_API_UNAVAILABLE',
      `Браузер не поддерживает API «${name}», необходимый для этой конвертации.`,
      { api: name },
    );
  }
}

async function loadDependency(packageName, importer, purpose) {
  try {
    return await importer();
  } catch (error) {
    throw new ConversionError(
      'DEPENDENCY_MISSING',
      `Для ${purpose} установите пакет «${packageName}» (npm install ${packageName}).`,
      { packageName },
      error,
    );
  }
}

async function loadMammoth() {
  const module = await loadDependency('mammoth', () => import('mammoth/mammoth.browser'), 'обработки DOCX');
  return module.default || module;
}

async function loadXlsx() {
  const module = await loadDependency('xlsx', () => import('xlsx'), 'конвертации XLSX');
  return module.default || module;
}

async function loadPdfMake() {
  const [pdfMakeModule, fontsModule] = await Promise.all([
    loadDependency('pdfmake', () => import('pdfmake/build/pdfmake.js'), 'создания PDF'),
    loadDependency('pdfmake', () => import('pdfmake/build/vfs_fonts.js'), 'поддержки шрифтов PDF'),
  ]);
  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const vfs = fontsModule.default?.pdfMake?.vfs
    || fontsModule.default?.vfs
    || fontsModule.pdfMake?.vfs
    || fontsModule.vfs
    || fontsModule.default;
  if (typeof pdfMake.createPdf !== 'function' || !vfs) {
    throw new ConversionError('INVALID_DEPENDENCY_API', 'Пакет «pdfmake» загружен, но его браузерный API не распознан.');
  }
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;
  return pdfMake;
}

async function loadImageTracer() {
  const module = await loadDependency('imagetracerjs', () => import('imagetracerjs'), 'трассировки изображения в SVG');
  const candidates = [module.default, module.ImageTracer, module].filter(Boolean);
  const tracer = candidates.find((candidate) => typeof candidate.imagedataToSVG === 'function');
  if (!tracer) {
    throw new ConversionError(
      'INVALID_DEPENDENCY_API',
      'Пакет «imagetracerjs» загружен, но метод imagedataToSVG не найден. Проверьте версию пакета.',
    );
  }
  return tracer;
}

async function loadUtif() {
  const module = await loadDependency('utif', () => import('utif'), 'чтения TIFF');
  const UTIF = module.default || module;
  if (typeof UTIF.decode !== 'function' || typeof UTIF.decodeImage !== 'function' || typeof UTIF.toRGBA8 !== 'function') {
    throw new ConversionError('INVALID_DEPENDENCY_API', 'Пакет «utif» загружен, но его API не распознан.');
  }
  return UTIF;
}

function extensionFormat(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/i);
  return normalizeFormat(match?.[1]);
}

function startsWithBytes(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function decodeHead(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

/**
 * Detect by magic bytes first, then MIME and extension. This is async because
 * browser File objects expose bytes asynchronously.
 */
export async function detectSourceFormat(file) {
  if (!(file instanceof Blob)) return '';
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());

  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWithBytes(bytes, [0x42, 0x4d])) return 'bmp';
  if (startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'webp';

  const head = decodeHead(bytes).replace(/^\ufeff/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';

  const mime = String(file.type || '').split(';', 1)[0].toLowerCase();
  const fromMime = MIME_TO_FORMAT.get(mime);
  const fromExtension = extensionFormat(file.name);

  // DOCX and XLSX share ZIP magic bytes, so their declared MIME/name is needed.
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (fromMime === 'docx' || fromExtension === 'docx') return 'docx';
    if (fromMime === 'xlsx' || fromExtension === 'xlsx') return 'xlsx';
  }
  // Browsers often label CSV files as application/vnd.ms-excel.
  if (fromExtension === 'csv') return 'csv';
  return fromMime || fromExtension || '';
}

export async function validateConversion(file, sourceFormat, targetFormat, options = {}) {
  const errors = [];
  const detectedFormat = await detectSourceFormat(file);
  const source = normalizeFormat(sourceFormat) || detectedFormat;
  const target = normalizeFormat(targetFormat);
  const maxFileSize = Number.isFinite(options.maxFileSize) ? options.maxFileSize : DEFAULT_MAX_FILE_SIZE;

  if (!(file instanceof Blob)) errors.push({ code: 'INVALID_FILE', message: 'Выберите файл для конвертации.' });
  else if (file.size === 0) errors.push({ code: 'EMPTY_FILE', message: 'Выбранный файл пуст.' });
  else if (maxFileSize > 0 && file.size > maxFileSize) {
    errors.push({ code: 'FILE_TOO_LARGE', message: `Размер файла превышает допустимые ${Math.round(maxFileSize / MIB)} МБ.` });
  }

  if (!source) errors.push({ code: 'UNKNOWN_SOURCE_FORMAT', message: 'Не удалось определить формат исходного файла.' });
  if (!target) errors.push({ code: 'UNKNOWN_TARGET_FORMAT', message: 'Не выбран формат результата.' });
  if (source && target && !isConversionSupported(source, target)) {
    errors.push({ code: 'UNSUPPORTED_CONVERSION', message: `Конвертация ${source.toUpperCase()} → ${target.toUpperCase()} не поддерживается.` });
  }
  if (
    sourceFormat
    && detectedFormat
    && source !== detectedFormat
    && !options.allowTypeMismatch
  ) {
    errors.push({
      code: 'SOURCE_FORMAT_MISMATCH',
      message: `Содержимое файла похоже на ${detectedFormat.toUpperCase()}, а выбран формат ${source.toUpperCase()}.`,
    });
  }

  return { valid: errors.length === 0, errors, sourceFormat: source, targetFormat: target, detectedFormat };
}

async function assertValidConversion(file, sourceFormat, targetFormat, options) {
  const validation = await validateConversion(file, sourceFormat, targetFormat, options);
  if (!validation.valid) {
    const first = validation.errors[0];
    throw new ConversionError(first.code, first.message, { validation });
  }
  return validation;
}

function makePreview(blob, enabled) {
  if (!enabled || !blob?.type?.startsWith('image/') || typeof URL?.createObjectURL !== 'function') return undefined;
  return URL.createObjectURL(blob);
}

function makeResult(file, sourceFormat, targetFormat, blob, options = {}) {
  const preview = makePreview(blob, options.createPreview !== false);
  return {
    blob,
    fileName: outputFileName(file, targetFormat, options.fileNameSuffix || ''),
    mime: blob.type || MIME_BY_FORMAT[targetFormat] || 'application/octet-stream',
    ...(preview ? { preview } : {}),
    meta: {
      sourceFormat,
      targetFormat,
      originalName: file?.name || '',
      originalSize: file?.size || 0,
      outputSize: blob.size,
      ...(preview ? { previewNeedsRevoke: true } : {}),
      ...(options.meta || {}),
    },
  };
}

export function revokePreview(result) {
  if (result?.meta?.previewNeedsRevoke && result.preview) URL.revokeObjectURL(result.preview);
}

export function downloadBlob(blob, fileName) {
  assertClientApi('URL.createObjectURL', typeof URL?.createObjectURL === 'function');
  assertClientApi('document', typeof document !== 'undefined');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createCanvas(width, height) {
  assertClientApi('document.createElement("canvas")', typeof document !== 'undefined');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decodeTiff(blob, options = {}) {
  const UTIF = await loadUtif();
  const data = await blob.arrayBuffer();
  let pages;
  try {
    pages = UTIF.decode(data);
  } catch (error) {
    throw new ConversionError('TIFF_DECODE_FAILED', 'Не удалось прочитать TIFF.', {}, error);
  }
  if (!pages.length) throw new ConversionError('TIFF_EMPTY', 'TIFF не содержит изображений.');
  const pageIndex = clamp(Math.trunc(Number(options.pageIndex) || 0), 0, pages.length - 1);
  const page = pages[pageIndex];
  UTIF.decodeImage(data, page);
  const rgba = UTIF.toRGBA8(page);
  const width = page.width;
  const height = page.height;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(width, height);
  imageData.data.set(rgba);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function decodeImage(blob, sourceFormat = '', options = {}) {
  if (normalizeFormat(sourceFormat) === 'tiff' || /^image\/tiff$/i.test(blob.type || '')) {
    return decodeTiff(blob, options);
  }
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'default', colorSpaceConversion: 'default' });
    } catch {
      // Safari and some older Chromium versions reject one or more options.
      try {
        return await createImageBitmap(blob);
      } catch {
        // Fall through to HTMLImageElement for SVG and older browsers.
      }
    }
  }

  assertClientApi('Image', typeof Image === 'function');
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ConversionError('IMAGE_DECODE_FAILED', 'Браузер не смог прочитать изображение.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function imageDimensions(image) {
  return {
    width: image.width || image.naturalWidth,
    height: image.height || image.naturalHeight,
  };
}

function closeImage(image) {
  if (typeof image?.close === 'function') image.close();
}

function calculateOutputSize(width, height, options = {}) {
  let targetWidth = Number(options.width) || width;
  let targetHeight = Number(options.height) || height;

  if (options.width && !options.height) targetHeight = Math.round(height * (targetWidth / width));
  if (options.height && !options.width) targetWidth = Math.round(width * (targetHeight / height));

  const maxWidth = Number(options.maxWidth) || Infinity;
  const maxHeight = Number(options.maxHeight) || Infinity;
  const scale = Math.min(maxWidth / targetWidth, maxHeight / targetHeight, options.allowUpscale ? Infinity : 1);
  if (Number.isFinite(scale) && scale < 1) {
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  return { width: Math.max(1, targetWidth), height: Math.max(1, targetHeight) };
}

function configureContext(context) {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
}

function renderImageToCanvas(image, width, height, outputFormat, options = {}) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: outputFormat !== 'jpeg', willReadFrequently: true });
  if (!context) throw new ConversionError('CANVAS_CONTEXT_FAILED', 'Не удалось создать графический контекст браузера.');
  configureContext(context);
  if (outputFormat === 'jpeg') {
    context.fillStyle = options.backgroundColor || '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  return { canvas, context };
}

async function canvasToBlob(canvas, mime, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new ConversionError('IMAGE_ENCODE_FAILED', 'Браузер не смог закодировать изображение.');
  const actualType = String(blob.type || '').toLowerCase();
  if (actualType && actualType !== mime) {
    throw new ConversionError(
      'IMAGE_FORMAT_UNSUPPORTED',
      `Этот браузер не поддерживает кодирование в ${mime}.`,
      { requestedMime: mime, actualMime: actualType },
    );
  }
  return blob;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleImageData(canvas, maxSize = DEFAULT_SSIM_SAMPLE_SIZE) {
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const sample = createCanvas(width, height);
  const context = sample.getContext('2d', { willReadFrequently: true });
  configureContext(context);
  context.drawImage(canvas, 0, 0, width, height);
  return { width, height, data: context.getImageData(0, 0, width, height).data };
}

async function encodedSample(blob, width, height) {
  const image = await decodeImage(blob);
  try {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    configureContext(context);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    closeImage(image);
  }
}

async function calculateSsim(reference, candidate, width, height, signal) {
  const blockSize = 8;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let score = 0;
  let blocks = 0;
  let blockCounter = 0;

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      let refMean = 0;
      let candidateMean = 0;
      let alphaDifference = 0;
      let count = 0;
      const luminance = [];

      for (let by = y; by < Math.min(y + blockSize, height); by++) {
        for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
          const index = (by * width + bx) * 4;
          const refY = reference[index] * 0.2126 + reference[index + 1] * 0.7152 + reference[index + 2] * 0.0722;
          const candidateY = candidate[index] * 0.2126 + candidate[index + 1] * 0.7152 + candidate[index + 2] * 0.0722;
          refMean += refY;
          candidateMean += candidateY;
          alphaDifference += Math.abs(reference[index + 3] - candidate[index + 3]);
          luminance.push([refY, candidateY]);
          count++;
        }
      }

      refMean /= count;
      candidateMean /= count;
      let refVariance = 0;
      let candidateVariance = 0;
      let covariance = 0;
      for (const [refY, candidateY] of luminance) {
        const refDelta = refY - refMean;
        const candidateDelta = candidateY - candidateMean;
        refVariance += refDelta ** 2;
        candidateVariance += candidateDelta ** 2;
        covariance += refDelta * candidateDelta;
      }
      const divisor = Math.max(1, count - 1);
      refVariance /= divisor;
      candidateVariance /= divisor;
      covariance /= divisor;

      const structural = (
        ((2 * refMean * candidateMean + c1) * (2 * covariance + c2))
        / ((refMean ** 2 + candidateMean ** 2 + c1) * (refVariance + candidateVariance + c2))
      );
      const alphaPenalty = 1 - alphaDifference / (count * 255);
      score += clamp(structural, 0, 1) * alphaPenalty;
      blocks++;
      blockCounter++;
      if (blockCounter % 128 === 0) await yieldToMainThread(signal);
    }
  }
  return blocks ? score / blocks : 1;
}

async function scoreBlob(blob, reference, signal) {
  const candidate = await encodedSample(blob, reference.width, reference.height);
  return calculateSsim(reference.data, candidate, reference.width, reference.height, signal);
}

async function pixelsEqualToCanvas(sourceCanvas, blob, options = {}) {
  const image = await decodeImage(blob);
  try {
    const dimensions = imageDimensions(image);
    if (dimensions.width !== sourceCanvas.width || dimensions.height !== sourceCanvas.height) return false;
    const stripHeight = Math.max(1, Math.min(256, sourceCanvas.height));
    const compareCanvas = createCanvas(sourceCanvas.width, stripHeight);
    const context = compareCanvas.getContext('2d', { willReadFrequently: true });
    configureContext(context);

    for (let y = 0; y < sourceCanvas.height; y += stripHeight) {
      throwIfAborted(options.signal);
      const height = Math.min(stripHeight, sourceCanvas.height - y);
      compareCanvas.height = height;
      configureContext(context);
      context.clearRect(0, 0, sourceCanvas.width, height);
      context.drawImage(image, 0, y, sourceCanvas.width, height, 0, 0, sourceCanvas.width, height);
      const expected = sourceCanvas.getContext('2d').getImageData(0, y, sourceCanvas.width, height).data;
      const actual = context.getImageData(0, 0, sourceCanvas.width, height).data;
      if (expected.length !== actual.length) return false;
      for (let index = 0; index < expected.length; index++) {
        if (expected[index] !== actual[index]) return false;
      }
      await yieldToMainThread(options.signal);
    }
    return true;
  } finally {
    closeImage(image);
  }
}

function asBlob(value, mime) {
  if (value instanceof Blob) return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return new Blob([value], { type: mime });
  throw new ConversionError('INVALID_OPTIMIZER_RESULT', 'PNG-оптимизатор должен вернуть Blob, ArrayBuffer или Uint8Array.');
}

async function encodeLosslessPng(file, sourceFormat, canvas, resized, options) {
  const candidates = [];
  reportProgress(options.onProgress, 0.35, 'encode', 'Кодирование PNG без потерь');
  const canvasBlob = await canvasToBlob(canvas, MIME_BY_FORMAT.png);
  candidates.push({ blob: canvasBlob, strategy: 'canvas-lossless' });

  // Keeping the original guarantees byte/pixel fidelity and preserves metadata.
  if (sourceFormat === 'png' && !resized) candidates.push({ blob: file, strategy: 'original' });

  if (typeof options.pngOptimizer === 'function') {
    await yieldToMainThread(options.signal);
    const optimizedValue = await options.pngOptimizer(canvasBlob, {
      signal: options.signal,
      onProgress: options.onProgress,
      lossless: true,
    });
    const optimized = asBlob(optimizedValue, MIME_BY_FORMAT.png);
    const isPng = !optimized.type || optimized.type === MIME_BY_FORMAT.png;
    if (!isPng) throw new ConversionError('INVALID_OPTIMIZER_RESULT', 'PNG-оптимизатор вернул файл другого формата.');
    candidates.push({ blob: optimized, strategy: 'external-lossless' });
  }

  // A canvas PNG is lossless relative to the rendered pixels. External output is
  // accepted only after a full RGBA comparison; no pngquant-style lossy fallback.
  const verified = [];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (candidate.strategy === 'original') {
      verified.push(candidate);
      continue;
    }
    reportProgress(options.onProgress, 0.5 + index / Math.max(1, candidates.length) * 0.35, 'verify', 'Проверка пиксельной идентичности PNG');
    if (await pixelsEqualToCanvas(canvas, candidate.blob, options)) verified.push(candidate);
  }

  if (!verified.length) {
    if (sourceFormat === 'png' && !resized) return { blob: file, strategy: 'original-fallback' };
    throw new ConversionError('PNG_LOSSLESS_CHECK_FAILED', 'Не удалось подтвердить конвертацию PNG без потери пикселей.');
  }
  return verified.sort((left, right) => left.blob.size - right.blob.size)[0];
}

async function encodeAdaptiveLossy(file, sourceFormat, targetFormat, canvas, resized, options) {
  const mime = MIME_BY_FORMAT[targetFormat];
  const minQuality = clamp(Number(options.minQuality ?? 0.68), 0.1, 1);
  const maxQuality = clamp(Number(options.maxQuality ?? 0.98), minQuality, 1);
  const minSsim = clamp(Number(options.minSsim ?? 0.985), 0, 1);
  const targetReduction = clamp(Number(options.targetReduction ?? options.targetSavings ?? 0.15), 0, 0.95);
  const targetBytes = Math.max(1, Number(options.targetBytes) || Math.floor(file.size * (1 - targetReduction)));
  const iterations = Math.round(clamp(Number(options.qualityIterations ?? DEFAULT_QUALITY_ITERATIONS), 2, 12));
  const reference = sampleImageData(canvas, Number(options.ssimSampleSize) || DEFAULT_SSIM_SAMPLE_SIZE);
  const candidates = [];
  const seen = new Set();

  const encodeCandidate = async (quality, progress) => {
    const roundedQuality = Math.round(quality * 10_000) / 10_000;
    if (seen.has(roundedQuality)) return candidates.find((candidate) => candidate.quality === roundedQuality);
    seen.add(roundedQuality);
    throwIfAborted(options.signal);
    reportProgress(options.onProgress, progress, 'quality-search', `Подбор качества ${Math.round(roundedQuality * 100)}%`, { quality: roundedQuality });
    const blob = await canvasToBlob(canvas, mime, roundedQuality);
    const ssim = await scoreBlob(blob, reference, options.signal);
    const candidate = { blob, quality: roundedQuality, ssim, original: false };
    candidates.push(candidate);
    await yieldToMainThread(options.signal);
    return candidate;
  };

  if (sourceFormat === targetFormat && !resized) {
    candidates.push({ blob: file, quality: 1, ssim: 1, original: true });
  }

  const highCandidate = await encodeCandidate(maxQuality, 0.32);
  const lowCandidate = await encodeCandidate(minQuality, 0.4);
  let low = minQuality;
  let high = maxQuality;

  if (highCandidate.blob.size > targetBytes) {
    for (let index = 0; index < iterations; index++) {
      const middle = (low + high) / 2;
      const candidate = await encodeCandidate(middle, 0.45 + (index / iterations) * 0.38);
      if (candidate.blob.size <= targetBytes) low = middle;
      else high = middle;
    }
  }

  const meetsVisualThreshold = (candidate) => candidate.ssim >= minSsim;
  const fitsTarget = (candidate) => candidate.blob.size <= targetBytes;
  // When the requested byte budget is too low, search the quality boundary as
  // well. Otherwise only the maximum-quality sample may survive the SSIM gate.
  if (!candidates.some((candidate) => meetsVisualThreshold(candidate) && fitsTarget(candidate))
      && highCandidate.ssim >= minSsim && lowCandidate.ssim < minSsim) {
    let qualityLow = minQuality;
    let qualityHigh = maxQuality;
    for (let index = 0; index < iterations; index++) {
      const candidate = await encodeCandidate((qualityLow + qualityHigh) / 2, 0.84 + index / iterations * 0.1);
      if (meetsVisualThreshold(candidate)) qualityHigh = candidate.quality;
      else qualityLow = candidate.quality;
    }
  }
  const feasible = candidates
    .filter((candidate) => meetsVisualThreshold(candidate) && fitsTarget(candidate))
    .sort((left, right) => right.quality - left.quality || left.blob.size - right.blob.size);

  let selected = feasible[0];
  let targetAchieved = Boolean(selected);
  if (!selected) {
    // If size and visual requirements conflict, preserve visual quality and make
    // the smallest result that still satisfies the requested SSIM threshold.
    selected = candidates
      .filter(meetsVisualThreshold)
      .sort((left, right) => left.blob.size - right.blob.size || right.quality - left.quality)[0];
  }
  if (!selected) selected = [highCandidate, lowCandidate].sort((left, right) => right.ssim - left.ssim)[0];
  targetAchieved = targetAchieved || (fitsTarget(selected) && meetsVisualThreshold(selected));

  return {
    ...selected,
    targetBytes,
    targetAchieved,
    minSsim,
    attempts: candidates.length,
  };
}

/**
 * Convert/optimise PNG, JPEG, WebP (and rasterise an SVG input) in the browser.
 * JPEG/WebP quality is selected adaptively against both size and sampled SSIM.
 * PNG never uses a lossy encoder.
 */
export async function optimizeRasterImage(file, outputFormat, options = {}) {
  const targetFormat = normalizeFormat(outputFormat);
  const sourceFormat = normalizeFormat(options.sourceFormat) || await detectSourceFormat(file);
  if (!IMAGE_INPUT_FORMATS.has(sourceFormat) || !RASTER_FORMATS.has(targetFormat)) {
    throw new ConversionError('UNSUPPORTED_IMAGE_FORMAT', `Нельзя преобразовать ${sourceFormat || 'файл'} в ${targetFormat || 'неизвестный формат'}.`);
  }
  await assertValidConversion(file, sourceFormat, targetFormat, options);
  throwIfAborted(options.signal);
  reportProgress(options.onProgress, 0.03, 'decode', 'Чтение изображения');

  const image = await decodeImage(file, sourceFormat, options);
  try {
    const sourceSize = imageDimensions(image);
    if (!sourceSize.width || !sourceSize.height) throw new ConversionError('INVALID_IMAGE', 'Изображение не содержит корректных размеров.');
    const maxPixels = Number(options.maxPixels) || DEFAULT_MAX_IMAGE_PIXELS;
    if (sourceSize.width * sourceSize.height > maxPixels) {
      throw new ConversionError(
        'IMAGE_TOO_LARGE',
        `Изображение слишком велико для безопасной обработки в браузере (${sourceSize.width}×${sourceSize.height}).`,
        { width: sourceSize.width, height: sourceSize.height, maxPixels },
      );
    }

    const size = calculateOutputSize(sourceSize.width, sourceSize.height, options);
    const resized = size.width !== sourceSize.width || size.height !== sourceSize.height;
    // JPEG discards transparency; optimization must not silently flatten it.
    if (options.onlyIfSmaller && !resized && targetFormat === 'jpeg' && sourceFormat !== 'jpeg') {
      const { canvas: alphaCanvas, context } = renderImageToCanvas(image, size.width, size.height, 'png', options);
      const pixels = context.getImageData(0, 0, size.width, size.height).data;
      let transparent = false;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 255) { transparent = true; break; }
      }
      alphaCanvas.width = alphaCanvas.height = 0;
      if (transparent) {
        reportProgress(options.onProgress, 1, 'done', 'Сохранён оригинал с прозрачностью');
        return makeResult(file, sourceFormat, sourceFormat, file, {
          ...options,
          meta: { width: size.width, height: size.height, keptOriginal: true, preservedTransparency: true, requestedFormat: targetFormat, savedBytes: 0, savedPercent: 0, targetAchieved: false },
        });
      }
    }
    reportProgress(options.onProgress, 0.15, 'render', 'Подготовка изображения', { width: size.width, height: size.height });
    const { canvas } = renderImageToCanvas(image, size.width, size.height, targetFormat, options);
    await yieldToMainThread(options.signal);

    let encoded;
    if (targetFormat === 'png') {
      encoded = await encodeLosslessPng(file, sourceFormat, canvas, resized, options);
    } else {
      encoded = await encodeAdaptiveLossy(file, sourceFormat, targetFormat, canvas, resized, options);
    }
    reportProgress(options.onProgress, 1, 'done', 'Изображение готово');

    // Optimization may retain the source; explicit conversion must keep its requested format.
    const keptOriginal = options.onlyIfSmaller === true && !resized
      && (encoded.blob.size >= file.size || (encoded.ssim != null && encoded.ssim < encoded.minSsim));
    const resultBlob = keptOriginal ? file : encoded.blob;
    const resultFormat = keptOriginal ? sourceFormat : targetFormat;
    return makeResult(file, sourceFormat, resultFormat, resultBlob, {
      ...options,
      meta: {
        width: size.width,
        height: size.height,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        resized,
        keptOriginal,
        requestedFormat: targetFormat,
        savedBytes: file.size - resultBlob.size,
        savedPercent: file.size ? ((file.size - resultBlob.size) / file.size) * 100 : 0,
        lossless: targetFormat === 'png' && !resized,
        pngStrategy: encoded.strategy,
        quality: keptOriginal ? undefined : encoded.quality,
        ssim: keptOriginal ? 1 : encoded.ssim,
        targetBytes: encoded.targetBytes,
        targetAchieved: keptOriginal ? false : encoded.targetAchieved,
        qualityAttempts: encoded.attempts,
      },
    });
  } catch (error) {
    if (error instanceof ConversionError || error?.name === 'AbortError') throw error;
    throw new ConversionError('IMAGE_CONVERSION_FAILED', 'Не удалось обработать изображение.', {}, error);
  } finally {
    closeImage(image);
  }
}

function sanitizeGeneratedSvg(svg) {
  assertClientApi('DOMParser', typeof DOMParser === 'function');
  const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentNode.querySelector('parsererror') || documentNode.documentElement?.localName !== 'svg') {
    throw new ConversionError('INVALID_SVG_RESULT', 'Трассировщик вернул некорректный SVG.');
  }

  documentNode.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((node) => node.remove());
  documentNode.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      if ((name === 'href' || name.endsWith(':href')) && !/^#/.test(value)) node.removeAttribute(attribute.name);
    }
  });
  if (!documentNode.documentElement.hasAttribute('xmlns')) {
    documentNode.documentElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return new XMLSerializer().serializeToString(documentNode.documentElement);
}

function applyTraceThreshold(imageData, threshold) {
  if (threshold === undefined || threshold === null || threshold === '') return false;
  const normalized = Number(threshold);
  if (!Number.isFinite(normalized)) {
    throw new ConversionError('INVALID_TRACE_OPTIONS', 'Порог трассировки должен быть числом от 0 до 255.');
  }
  const cutoff = normalized <= 1 ? normalized * 255 : clamp(normalized, 0, 255);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = imageData.data[index] * 0.2126 + imageData.data[index + 1] * 0.7152 + imageData.data[index + 2] * 0.0722;
    const value = luminance >= cutoff ? 255 : 0;
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
  }
  return true;
}

/** Trace a PNG/JPEG/WebP into a genuine path-based SVG using imagetracerjs. */
export async function traceRasterToSvg(file, options = {}) {
  const sourceFormat = normalizeFormat(options.sourceFormat) || await detectSourceFormat(file);
  if (!RASTER_INPUT_FORMATS.has(sourceFormat)) {
    throw new ConversionError('UNSUPPORTED_IMAGE_FORMAT', 'Для трассировки выберите PNG, JPEG, WebP, BMP или TIFF.');
  }
  await assertValidConversion(file, sourceFormat, 'svg', options);
  throwIfAborted(options.signal);
  reportProgress(options.onProgress, 0.03, 'decode', 'Чтение растрового изображения');

  const image = await decodeImage(file, sourceFormat, options);
  try {
    const sourceSize = imageDimensions(image);
    const size = calculateOutputSize(sourceSize.width, sourceSize.height, options);
    const maxPixels = Number(options.maxPixels) || 24_000_000;
    if (size.width * size.height > maxPixels) {
      throw new ConversionError(
        'IMAGE_TOO_LARGE_FOR_TRACE',
        `Для трассировки уменьшите изображение: текущий размер ${size.width}×${size.height}.`,
        { width: size.width, height: size.height, maxPixels },
      );
    }

    const { canvas, context } = renderImageToCanvas(image, size.width, size.height, 'png', options);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const requestedMode = options.mode || (options.threshold !== undefined && options.threshold !== null ? 'monochrome' : 'color');
    const monochrome = requestedMode !== 'color' && applyTraceThreshold(imageData, options.threshold ?? 128);
    await yieldToMainThread(options.signal);
    reportProgress(options.onProgress, 0.25, 'dependency', 'Загрузка трассировщика');
    const tracer = await loadImageTracer();

    const smoothing = clamp(Number(options.smoothing ?? 0.16), 0, 1);
    const detail = clamp(Number(options.detail ?? 0.85), 0, 1);
    const requestedColors = Number.isFinite(Number(options.colors))
      ? Math.round(clamp(Number(options.colors), 2, 256))
      : Math.round(16 + detail * 48);
    const palette = Array.isArray(options.colors)
      ? options.colors.map((color) => ({
        r: clamp(Number(color.r ?? color[0] ?? 0), 0, 255),
        g: clamp(Number(color.g ?? color[1] ?? 0), 0, 255),
        b: clamp(Number(color.b ?? color[2] ?? 0), 0, 255),
        a: clamp(Number(color.a ?? color[3] ?? 255), 0, 255),
      }))
      : null;
    const traceOptions = {
      ltres: 0.01 + smoothing * 1.25,
      qtres: 0.01 + smoothing * 1.25,
      pathomit: Math.max(0, Math.round((1 - detail) * 12)),
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: monochrome ? 2 : palette?.length || requestedColors,
      mincolorratio: 0,
      colorquantcycles: Math.round(2 + detail * 3),
      layering: 0,
      strokewidth: 0,
      linefilter: false,
      scale: 1,
      roundcoords: detail > 0.75 ? 2 : 1,
      blurradius: smoothing > 0.5 ? Math.round(smoothing * 3) : 0,
      blurdelta: 20,
      viewbox: true,
      ...(palette?.length ? { pal: palette } : {}),
      ...options.traceOptions,
    };

    throwIfAborted(options.signal);
    reportProgress(options.onProgress, 0.4, 'trace', 'Построение векторных контуров');
    // ImageTracer's tracing call is synchronous; yielding immediately before and
    // after it lets pending React updates paint. A worker adapter can be supplied
    // in the future without changing the public API.
    await yieldToMainThread(options.signal);
    const rawSvg = tracer.imagedataToSVG(imageData, traceOptions);
    await yieldToMainThread(options.signal);
    const svg = sanitizeGeneratedSvg(rawSvg);
    const blob = new Blob([svg], { type: `${MIME_BY_FORMAT.svg};charset=utf-8` });
    reportProgress(options.onProgress, 1, 'done', 'SVG готов');
    return makeResult(file, sourceFormat, 'svg', blob, {
      ...options,
      meta: {
        width: size.width,
        height: size.height,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        threshold: monochrome ? options.threshold : null,
        mode: requestedMode,
        colors: monochrome ? 2 : palette?.length || requestedColors,
        smoothing,
        detail,
        svg,
      },
    });
  } catch (error) {
    if (error instanceof ConversionError || error?.name === 'AbortError') throw error;
    throw new ConversionError('SVG_TRACE_FAILED', 'Не удалось выполнить трассировку изображения.', {}, error);
  } finally {
    closeImage(image);
  }
}

function detectCsvDelimiter(text) {
  const candidates = [',', ';', '\t', '|'];
  const sample = text.slice(0, 64 * KIB);
  const countsByLine = new Map(candidates.map((candidate) => [candidate, []]));
  let inQuotes = false;
  let current = Object.fromEntries(candidates.map((candidate) => [candidate, 0]));
  let lines = 0;

  for (let index = 0; index < sample.length && lines < 30; index++) {
    const char = sample[index];
    if (char === '"') {
      if (inQuotes && sample[index + 1] === '"') index++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && candidates.includes(char)) current[char]++;
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && sample[index + 1] === '\n') index++;
      for (const candidate of candidates) countsByLine.get(candidate).push(current[candidate]);
      current = Object.fromEntries(candidates.map((candidate) => [candidate, 0]));
      lines++;
    }
  }
  if (Object.values(current).some(Boolean)) {
    for (const candidate of candidates) countsByLine.get(candidate).push(current[candidate]);
  }

  let best = ',';
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const counts = countsByLine.get(candidate).filter((count) => count > 0);
    if (!counts.length) continue;
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + (count - average) ** 2, 0) / counts.length;
    const consistency = counts.length / Math.max(1, countsByLine.get(candidate).length);
    const score = consistency * 10 + average - variance;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function decodeTextFile(file, encoding = 'auto') {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (encoding && encoding !== 'auto') {
    try {
      return { text: new TextDecoder(encoding).decode(bytes).replace(/^\ufeff/, ''), encoding };
    } catch (error) {
      throw new ConversionError('UNSUPPORTED_ENCODING', `Кодировка «${encoding}» не поддерживается браузером.`, { encoding }, error);
    }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\ufeff/, ''), encoding: 'utf-8' };
  } catch {
    try {
      return { text: new TextDecoder('windows-1251').decode(bytes).replace(/^\ufeff/, ''), encoding: 'windows-1251' };
    } catch (error) {
      throw new ConversionError('TEXT_DECODE_FAILED', 'Не удалось определить кодировку CSV. Укажите encoding явно.', {}, error);
    }
  }
}

export async function parseCsv(text, options = {}) {
  const delimiter = options.delimiter || detectCsvDelimiter(text);
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || /[\r\n]/.test(delimiter)) {
    throw new ConversionError('INVALID_CSV_DELIMITER', 'Разделитель CSV должен быть одним символом.');
  }

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const chunkSize = Math.max(10_000, Number(options.yieldEveryCharacters) || 100_000);

  const pushRow = () => {
    row.push(field);
    field = '';
    const isEmpty = row.every((value) => value === '');
    if (!options.skipEmptyLines || !isEmpty) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index++) {
    throwIfAborted(options.signal);
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      pushRow();
    } else {
      field += char;
    }

    if (index > 0 && index % chunkSize === 0) {
      reportProgress(options.onProgress, index / Math.max(1, text.length), 'parse', 'Разбор строк CSV', { rows: rows.length });
      await yieldToMainThread(options.signal);
    }
  }

  if (inQuotes) throw new ConversionError('INVALID_CSV', 'В CSV обнаружено незакрытое поле в кавычках.');
  if (field !== '' || row.length) pushRow();
  return { rows, delimiter };
}

function makeUniqueHeaders(row, trimHeaders = true) {
  const used = new Map();
  return row.map((value, index) => {
    const candidate = (trimHeaders ? value.trim() : value) || `column_${index + 1}`;
    const count = (used.get(candidate) || 0) + 1;
    used.set(candidate, count);
    return count === 1 ? candidate : `${candidate}_${count}`;
  });
}

function countColumns(rows) {
  let maximum = 0;
  for (const row of rows) maximum = Math.max(maximum, row.length);
  return maximum;
}

function inferJsonValue(value) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^null$/i.test(trimmed)) return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed) && !/^-?0\d/.test(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number) && Number.isSafeInteger(number)) return number;
    if (Number.isFinite(number) && trimmed.includes('.')) return number;
  }
  return value;
}

async function serializeJsonRows(rows, indent, options = {}) {
  if (!indent) {
    const chunks = ['['];
    for (let index = 0; index < rows.length; index++) {
      if (index) chunks.push(',');
      chunks.push(JSON.stringify(rows[index]));
      if (index > 0 && index % 1000 === 0) await yieldToMainThread(options.signal);
    }
    chunks.push(']');
    return chunks.join('');
  }

  const padding = ' '.repeat(indent);
  const chunks = ['[\n'];
  for (let index = 0; index < rows.length; index++) {
    const encoded = JSON.stringify(rows[index], null, indent).replace(/^/gm, padding);
    chunks.push(encoded, index === rows.length - 1 ? '\n' : ',\n');
    if (index > 0 && index % 500 === 0) await yieldToMainThread(options.signal);
  }
  chunks.push(']');
  return chunks.join('');
}

export async function convertCsvToJson(file, options = {}) {
  const sourceFormat = normalizeFormat(options.sourceFormat) || await detectSourceFormat(file);
  await assertValidConversion(file, sourceFormat, 'json', options);
  reportProgress(options.onProgress, 0.03, 'read', 'Чтение CSV');
  const decoded = await decodeTextFile(file, options.encoding || 'auto');
  await yieldToMainThread(options.signal);
  const parsed = await parseCsv(decoded.text, {
    ...options,
    skipEmptyLines: options.skipEmptyLines !== false,
    onProgress: (event) => reportProgress(options.onProgress, 0.08 + event.progress * 0.68, event.stage, event.message, event),
  });

  const hasHeaders = options.headers !== false;
  let jsonRows;
  let headers = [];
  if (hasHeaders) {
    headers = makeUniqueHeaders(parsed.rows.shift() || [], options.trimHeaders !== false);
    jsonRows = parsed.rows.map((values) => {
      const result = Object.create(null);
      headers.forEach((header, index) => {
        const value = values[index] ?? '';
        result[header] = options.inferTypes ? inferJsonValue(value) : value;
      });
      return result;
    });
  } else {
    jsonRows = options.inferTypes ? parsed.rows.map((row) => row.map(inferJsonValue)) : parsed.rows;
  }

  reportProgress(options.onProgress, 0.8, 'serialize', 'Формирование JSON');
  const indent = clamp(Number(options.indent ?? 2), 0, 8);
  const json = await serializeJsonRows(jsonRows, indent, options);
  const blob = new Blob([json], { type: MIME_BY_FORMAT.json });
  reportProgress(options.onProgress, 1, 'done', 'JSON готов');
  return makeResult(file, sourceFormat, 'json', blob, {
    ...options,
    meta: { rows: jsonRows.length, columns: headers.length || countColumns(parsed.rows), headers, delimiter: parsed.delimiter, encoding: decoded.encoding },
  });
}

function escapeCsvCell(value, delimiter, protectFormula) {
  let text = value === null || value === undefined ? '' : String(value);
  const numericText = /^[\t\r ]*[+\-](?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?[\t\r ]*$/i.test(text);
  if (protectFormula && typeof value === 'string' && !numericText && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  if (text.includes('"')) text = text.replace(/"/g, '""');
  if (text.includes(delimiter) || /["\r\n]/.test(text) || /^\s|\s$/.test(text)) return `"${text}"`;
  return text;
}

async function serializeCsvRows(rows, options = {}) {
  const delimiter = options.delimiter || ',';
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || /[\r\n]/.test(delimiter)) {
    throw new ConversionError('INVALID_CSV_DELIMITER', 'Разделитель CSV должен быть одним символом.');
  }
  const lineEnding = options.lineEnding === '\n' ? '\n' : '\r\n';
  const chunks = [];
  for (let index = 0; index < rows.length; index++) {
    throwIfAborted(options.signal);
    chunks.push(rows[index].map((value) => escapeCsvCell(value, delimiter, options.protectFormulas !== false)).join(delimiter));
    if (index < rows.length - 1) chunks.push(lineEnding);
    if (index > 0 && index % 1000 === 0) {
      reportProgress(options.onProgress, index / Math.max(1, rows.length), 'serialize', 'Формирование CSV', { rows: index });
      await yieldToMainThread(options.signal);
    }
  }
  return `${options.bom === false ? '' : '\ufeff'}${chunks.join('')}`;
}

/** Convert one XLSX worksheet to RFC-compatible CSV. */
export async function convertXlsxToCsv(file, options = {}) {
  const sourceFormat = normalizeFormat(options.sourceFormat) || await detectSourceFormat(file);
  await assertValidConversion(file, sourceFormat, 'csv', options);
  throwIfAborted(options.signal);
  reportProgress(options.onProgress, 0.03, 'dependency', 'Загрузка обработчика XLSX');
  const XLSX = await loadXlsx();
  await yieldToMainThread(options.signal);
  reportProgress(options.onProgress, 0.12, 'read', 'Чтение книги XLSX');
  const data = await file.arrayBuffer();
  throwIfAborted(options.signal);

  let workbook;
  try {
    // SheetJS parsing itself is synchronous. Yielding around it prevents queued
    // paints from being starved; row serialization below is chunked.
    await yieldToMainThread(options.signal);
    workbook = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      dense: true,
      WTF: false,
      ...(options.xlsxReadOptions || {}),
    });
    await yieldToMainThread(options.signal);
  } catch (error) {
    throw new ConversionError('XLSX_READ_FAILED', 'Не удалось прочитать XLSX. Возможно, файл повреждён или защищён паролем.', {}, error);
  }

  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) throw new ConversionError('XLSX_EMPTY', 'В книге XLSX нет листов.');
  let sheetName;
  if (typeof options.sheet === 'string') sheetName = options.sheet;
  else {
    const index = Number.isInteger(options.sheet) ? options.sheet : 0;
    sheetName = sheetNames[index];
  }
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new ConversionError('XLSX_SHEET_NOT_FOUND', 'Выбранный лист XLSX не найден.', { requestedSheet: options.sheet, sheetNames });
  }

  reportProgress(options.onProgress, 0.58, 'extract', `Чтение листа «${sheetName}»`);
  let rows;
  try {
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: options.rawValues === true,
      defval: '',
      blankrows: options.includeBlankRows === true,
      dateNF: options.dateFormat || 'yyyy-mm-dd',
      ...(options.sheetToJsonOptions || {}),
    });
  } catch (error) {
    throw new ConversionError('XLSX_SHEET_READ_FAILED', `Не удалось прочитать лист «${sheetName}».`, { sheetName }, error);
  }
  await yieldToMainThread(options.signal);

  const csv = await serializeCsvRows(rows, {
    ...options,
    onProgress: (event) => reportProgress(options.onProgress, 0.65 + event.progress * 0.3, event.stage, event.message, event),
  });
  const blob = new Blob([csv], { type: MIME_BY_FORMAT.csv });
  reportProgress(options.onProgress, 1, 'done', 'CSV готов');
  return makeResult(file, sourceFormat, 'csv', blob, {
    ...options,
    fileNameSuffix: options.appendSheetName ? `_${sanitizeFileName(sheetName)}` : options.fileNameSuffix,
    meta: {
      sheetName,
      sheetNames,
      rows: rows.length,
      columns: countColumns(rows),
      delimiter: options.delimiter || ',',
      formulaProtection: options.protectFormulas !== false,
    },
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeDocumentHtml(html) {
  assertClientApi('DOMParser', typeof DOMParser === 'function');
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  documentNode.querySelectorAll('script, iframe, object, embed, form, input, button, meta, base').forEach((node) => node.remove());
  documentNode.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'srcdoc') node.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'src' || name.endsWith(':href')) && /^\s*(?:javascript|vbscript):/i.test(value)) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return documentNode.body.innerHTML;
}

async function docxImageConverter(mammoth, options) {
  if (options.includeImages === false) return undefined;
  return mammoth.images.imgElement(async (image) => {
    throwIfAborted(options.signal);
    const contentType = String(image.contentType || 'application/octet-stream').toLowerCase();
    const arrayBuffer = typeof image.readAsArrayBuffer === 'function'
      ? await image.readAsArrayBuffer()
      : await image.read();
    const bytes = new Uint8Array(arrayBuffer);
    await yieldToMainThread(options.signal);
    return {
      src: `data:${contentType};base64,${bytesToBase64(bytes)}`,
      alt: '',
    };
  });
}

async function extractDocxHtml(file, options = {}) {
  reportProgress(options.onProgress, 0.03, 'dependency', 'Загрузка обработчика DOCX');
  const mammoth = await loadMammoth();
  throwIfAborted(options.signal);
  const arrayBuffer = await file.arrayBuffer();
  await yieldToMainThread(options.signal);
  const convertImage = await docxImageConverter(mammoth, options);
  reportProgress(options.onProgress, 0.18, 'convert', 'Извлечение содержимого DOCX');
  let result;
  try {
    result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        ...(convertImage ? { convertImage } : {}),
        styleMap: options.styleMap,
        includeDefaultStyleMap: options.includeDefaultStyleMap !== false,
        ignoreEmptyParagraphs: options.ignoreEmptyParagraphs !== false,
      },
    );
  } catch (error) {
    throw new ConversionError('DOCX_READ_FAILED', 'Не удалось прочитать DOCX. Возможно, файл повреждён или защищён паролем.', {}, error);
  }
  throwIfAborted(options.signal);
  await yieldToMainThread(options.signal);
  const html = options.sanitize === false ? result.value : sanitizeDocumentHtml(result.value);
  const messages = (result.messages || []).map((message) => ({ type: message.type, message: message.message }));
  return { html, messages };
}

/** Convert DOCX to a safe HTML fragment (or a complete document). */
export async function convertDocxToHtml(file, options = {}) {
  const sourceFormat = normalizeFormat(options.sourceFormat) || await detectSourceFormat(file);
  await assertValidConversion(file, sourceFormat, 'html', options);
  const extracted = await extractDocxHtml(file, options);
  let html = extracted.html;
  if (options.fullDocument) {
    const title = escapeHtml(options.title || getBaseName(file.name));
    html = `<!doctype html>\n<html lang="${escapeHtml(options.lang || 'ru')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body>${html}</body></html>`;
  }
  const blob = new Blob([html], { type: MIME_BY_FORMAT.html });
  reportProgress(options.onProgress, 1, 'done', 'HTML готов');
  return makeResult(file, sourceFormat, 'html', blob, {
    ...options,
    meta: { html, messages: extracted.messages, fullDocument: Boolean(options.fullDocument) },
  });
}

function normalizePdfText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function collectPdfBlocks(html) {
  assertClientApi('DOMParser', typeof DOMParser === 'function');
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [];

  const visit = (element) => {
    const tag = element.tagName?.toLowerCase();
    if (!tag) return;
    if (tag === 'img') {
      if (element.getAttribute('src')) blocks.push({ type: 'image', src: element.getAttribute('src'), alt: element.getAttribute('alt') || '' });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: 'heading', level: Number(tag[1]), text: normalizePdfText(element.textContent) });
      element.querySelectorAll('img').forEach(visit);
      return;
    }
    if (tag === 'p') {
      const text = normalizePdfText(element.textContent);
      if (text) blocks.push({ type: 'paragraph', text });
      element.querySelectorAll('img').forEach(visit);
      return;
    }
    if (tag === 'pre') {
      const text = String(element.textContent || '').replace(/\r\n?/g, '\n').trim();
      if (text) blocks.push({ type: 'pre', text });
      return;
    }
    if (tag === 'blockquote') {
      const text = normalizePdfText(element.textContent);
      if (text) blocks.push({ type: 'quote', text });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      [...element.children].filter((child) => child.tagName?.toLowerCase() === 'li').forEach((item, index) => {
        const text = normalizePdfText(item.textContent);
        if (text) blocks.push({ type: 'list', ordered: tag === 'ol', index: index + 1, text });
        item.querySelectorAll('img').forEach(visit);
      });
      return;
    }
    if (tag === 'table') {
      element.querySelectorAll('tr').forEach((row) => {
        const cells = [...row.children].map((cell) => normalizePdfText(cell.textContent));
        if (cells.some(Boolean)) blocks.push({ type: 'table-row', text: cells.join('  |  ') });
      });
      element.querySelectorAll('img').forEach(visit);
      return;
    }
    [...element.children].forEach(visit);
  };

  [...documentNode.body.children].forEach(visit);
  return blocks;
}

function inspectImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,[a-z0-9+/=\s]+$/i);
  if (!match) return null;
  return { mime: match[1].toLowerCase() };
}

function pdfMakeContentFromBlocks(blocks, warnings, options = {}) {
  const content = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.type === 'image') {
      const source = inspectImageDataUrl(block.src);
      if (!source || !['image/png', 'image/jpeg', 'image/jpg'].includes(source.mime)) {
        warnings.push({ type: 'warning', message: `Изображение «${block.alt || index + 1}» пропущено: PDF поддерживает PNG и JPEG.` });
      } else {
        content.push({ image: block.src, fit: options.imageFit || [499, 650], margin: [0, 6, 0, 10] });
      }
      continue;
    }
    if (!block.text) continue;
    if (block.type === 'heading') {
      content.push({ text: block.text, style: `heading${block.level}`, margin: [0, block.level === 1 ? 8 : 5, 0, 5] });
    } else if (block.type === 'list') {
      content.push({ text: `${block.ordered ? `${block.index}.` : '•'} ${block.text}`, margin: [14, 1, 0, 3] });
    } else if (block.type === 'table-row') {
      content.push({ text: block.text, style: 'tableRow', margin: [0, 1, 0, 2] });
    } else if (block.type === 'quote') {
      content.push({ text: block.text, style: 'quote', margin: [14, 4, 8, 7] });
    } else if (block.type === 'pre') {
      content.push({ text: block.text, style: 'pre', preserveLeadingSpaces: true, margin: [8, 5, 8, 8] });
    } else {
      content.push({ text: block.text, margin: [0, 0, 0, 7] });
    }
  }
  return content.length ? content : [{ text: '' }];
}

async function renderPdfMakeBlob(pdfMake, documentDefinition, options) {
  if (options.vfs) {
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(options.vfs);
    else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...options.vfs };
  }
  if (options.fonts && typeof pdfMake.addFonts === 'function') pdfMake.addFonts(options.fonts);

  return new Promise((resolve, reject) => {
    try {
      const document = pdfMake.createPdf(documentDefinition, options.tableLayouts, options.fonts, options.vfs);
      const operation = document.getBuffer((buffer) => resolve(new Blob([buffer], { type: MIME_BY_FORMAT.pdf })));
      if (operation?.catch) operation.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

/** Convert DOCX to a paginated PDF with bundled Cyrillic-capable Roboto fonts. */
export async function convertDocxToPdf(file, options = {}) {
  const sourceFormat = normalizeFormat(options.sourceFormat) || await detectSourceFormat(file);
  await assertValidConversion(file, sourceFormat, 'pdf', options);
  throwIfAborted(options.signal);

  const extracted = await extractDocxHtml(file, {
    ...options,
    onProgress: (event) => reportProgress(options.onProgress, event.progress * 0.38, event.stage, event.message, event),
  });
  const blocks = collectPdfBlocks(extracted.html);
  const warnings = [...extracted.messages];
  reportProgress(options.onProgress, 0.42, 'dependency', 'Загрузка PDF-движка');
  await yieldToMainThread(options.signal);
  const pdfMake = await loadPdfMake();
  throwIfAborted(options.signal);

  reportProgress(options.onProgress, 0.58, 'layout', 'Вёрстка PDF');
  const bodySize = clamp(Number(options.fontSize ?? 11), 7, 24);
  const margin = clamp(Number(options.margin ?? 48), 16, 160);
  const content = pdfMakeContentFromBlocks(blocks, warnings, options);
  const pageSize = Array.isArray(options.pageSize) && options.pageSize.length === 2
    ? { width: Number(options.pageSize[0]), height: Number(options.pageSize[1]) }
    : options.pageSize || 'A4';
  const documentDefinition = {
    pageSize,
    pageOrientation: options.pageOrientation === 'landscape' ? 'landscape' : 'portrait',
    pageMargins: options.pageMargins || [margin, margin, margin, margin],
    info: {
      title: options.title || getBaseName(file.name),
      author: options.author || 'Lotus Docs',
      creator: 'Lotus Docs',
      producer: 'Lotus Docs / pdfmake',
    },
    defaultStyle: {
      font: options.font || 'Roboto',
      fontSize: bodySize,
      lineHeight: Number(options.lineHeightRatio ?? 1.28),
      color: '#1b1b20',
    },
    styles: {
      heading1: { fontSize: bodySize + 10, bold: true, lineHeight: 1.15 },
      heading2: { fontSize: bodySize + 7, bold: true, lineHeight: 1.18 },
      heading3: { fontSize: bodySize + 5, bold: true, lineHeight: 1.2 },
      heading4: { fontSize: bodySize + 3, bold: true },
      heading5: { fontSize: bodySize + 2, bold: true },
      heading6: { fontSize: bodySize + 1, bold: true },
      quote: { color: '#55555f', italics: true },
      pre: { fontSize: Math.max(7, bodySize - 1), color: '#292930', background: '#f3f3f6' },
      tableRow: { fontSize: Math.max(7, bodySize - 1) },
      ...(options.styles || {}),
    },
    content,
    ...(options.pdfMakeDocument || {}),
  };
  await yieldToMainThread(options.signal);
  reportProgress(options.onProgress, 0.86, 'save', 'Сохранение PDF');
  let blob;
  try {
    blob = await renderPdfMakeBlob(pdfMake, documentDefinition, options);
  } catch (error) {
    throw new ConversionError('PDF_CREATE_FAILED', 'Не удалось создать PDF из DOCX.', {}, error);
  }
  throwIfAborted(options.signal);
  reportProgress(options.onProgress, 1, 'done', 'PDF готов');
  return makeResult(file, sourceFormat, 'pdf', blob, {
    ...options,
    meta: { blocks: blocks.length, messages: warnings, font: options.font || 'Roboto', engine: 'pdfmake' },
  });
}

/**
 * Stable dispatcher API used by the React UI.
 *
 * @param {File|Blob} file
 * @param {string} sourceFormat - pass an empty string for automatic detection
 * @param {string} targetFormat
 * @param {object} options - `targetSavings` is an alias of `targetReduction`;
 *   `onProgress` receives { progress: 0..1, stage, message }. Legacy callbacks
 *   declared with two arguments receive (percent: 0..100, message, event).
 * @returns {Promise<{blob: Blob, fileName: string, mime: string, preview?: string, meta: object}>}
 */
export async function convertFile(file, sourceFormat, targetFormat, options = {}) {
  // Also accept convertFile(file, targetFormat, options) for small integrations.
  if (targetFormat && typeof targetFormat === 'object') {
    options = targetFormat;
    targetFormat = sourceFormat;
    sourceFormat = '';
  }
  const validation = await assertValidConversion(file, sourceFormat, targetFormat, options);
  const source = validation.sourceFormat;
  const target = validation.targetFormat;
  const converterOptions = { ...options, sourceFormat: source };

  if (IMAGE_INPUT_FORMATS.has(source) && RASTER_FORMATS.has(target)) {
    return optimizeRasterImage(file, target, converterOptions);
  }
  if (RASTER_INPUT_FORMATS.has(source) && target === 'svg') {
    return traceRasterToSvg(file, converterOptions);
  }
  if (source === 'csv' && target === 'json') return convertCsvToJson(file, converterOptions);
  if (source === 'xlsx' && target === 'csv') return convertXlsxToCsv(file, converterOptions);
  if (source === 'docx' && target === 'html') return convertDocxToHtml(file, converterOptions);
  if (source === 'docx' && target === 'pdf') return convertDocxToPdf(file, converterOptions);

  throw new ConversionError('UNSUPPORTED_CONVERSION', `Конвертация ${source.toUpperCase()} → ${target.toUpperCase()} не реализована.`);
}

// Descriptive aliases for consumers that prefer format-oriented names.
export const rasterToSvg = traceRasterToSvg;
export const csvToJson = convertCsvToJson;
export const xlsxToCsv = convertXlsxToCsv;
export const docxToHtml = convertDocxToHtml;
export const docxToPdf = convertDocxToPdf;
