import { IMAGE_EXTENSION_BY_TYPE } from '../../constants/article';
import { COMPRESSION_PRESETS } from '../../constants/compression';
import { base64ToBlob, downloadBlob, loadJSZip, yieldToBrowser } from '../../utils/browserFiles';
import { optimizeRasterImage, sanitizeFileName } from '../../utils/fileConverters';
import { htmlToMarkdown, htmlToPlainText } from '../../utils/htmlCleaner';

import { prepareArticleHtml } from './articleMarkup';
export { prepareArticleHtml, articlePreviewHtml } from './articleMarkup';

export function articleImageName(index, contentType, extensionOverride) {
  const extension = extensionOverride || IMAGE_EXTENSION_BY_TYPE[contentType] || 'bin';
  return 'article-image-' + String(index + 1).padStart(3, '0') + '.' + extension;
}

export function imageManifest(images) {
  return images.map(({ number, name, contentType, size, optimized }) => ({
    number,
    fileName: optimized?.name || name,
    originalType: contentType,
    outputType: optimized?.type || contentType,
    originalSize: size,
    outputSize: optimized?.size ?? size,
    savedBytes: Math.max(0, size - (optimized?.size ?? size)),
  }));
}

export async function readDocxDirect(file, onProgress) {
  const module = await import('mammoth/mammoth.browser');
  const mammoth = module.default || module;
  const images = [];
  onProgress(12, 'Читаем структуру DOCX');
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const number = images.length + 1;
        const contentType = image.contentType || 'application/octet-stream';
        images.push({ number, contentType });
        const base64 = await image.read('base64');
        images[number - 1].base64 = base64;
        onProgress(Math.min(58, 18 + number * 2), 'Извлекаем изображения: ' + number);
        return {
          src: 'lotus-image:' + number,
          alt: 'Изображение ' + number,
          'data-image-number': String(number),
        };
      }),
    },
  );
  return {
    sourceHtml: result.value,
    images,
    messages: (result.messages || []).map((message) => ({
      type: message.type || 'warning',
      message: message.message || String(message),
    })),
  };
}

export function readDocxInWorker(file, onProgress) {
  return new Promise(async (resolve, reject) => {
    let worker;
    let workerStarted = false;
    try {
      worker = new Worker(new URL('../../workers/docx.worker.js', import.meta.url), { type: 'module' });
      const arrayBuffer = await file.arrayBuffer();
      worker.addEventListener('message', (event) => {
        const message = event.data || {};
        if (message.type === 'progress') {
          workerStarted = true;
          onProgress(message.value, message.label);
          return;
        }
        worker.terminate();
        if (message.type === 'done') resolve(message.payload);
        else reject(new Error(message.message || 'Worker не смог обработать DOCX.'));
      });
      worker.addEventListener('error', (event) => {
        worker.terminate();
        const workerError = new Error(event.message || 'Фоновая обработка DOCX завершилась с ошибкой.');
        workerError.workerUnavailable = !workerStarted;
        reject(workerError);
      });
      worker.postMessage({ arrayBuffer }, [arrayBuffer]);
    } catch (error) {
      worker?.terminate();
      const workerError = error instanceof Error ? error : new Error(String(error));
      workerError.workerUnavailable = true;
      reject(workerError);
    }
  });
}

export async function extractArticle(file, options, onProgress) {
  let extracted;
  try {
    extracted = await readDocxInWorker(file, onProgress);
  } catch (workerError) {
    if (!workerError?.workerUnavailable) throw workerError;
    extracted = await readDocxDirect(file, onProgress);
  }

  const images = [];
  for (let index = 0; index < extracted.images.length; index += 1) {
    const source = extracted.images[index];
    const contentType = source.contentType || 'application/octet-stream';
    const originalBlob = base64ToBlob(source.base64, contentType);
    const originalName = articleImageName(index, contentType);
    let optimized = null;
    onProgress(
      58 + Math.round(((index + 1) / Math.max(1, extracted.images.length)) * 26),
      'Оптимизируем изображения: ' + (index + 1) + ' из ' + extracted.images.length,
    );
    if (!contentType.includes('svg') && contentType.startsWith('image/')) {
      try {
        const output = await optimizeRasterImage(originalBlob, options.imageExtension, {
          ...COMPRESSION_PRESETS[options.compressionMode || 'balanced'],
          onlyIfSmaller: true,
          preserveDimensions: true,
          targetSavings: 0.28,
          targetReduction: 0.28,
          createPreview: false,
        });
        const actualFormat = output.meta.targetFormat;
        const extension = actualFormat === 'jpeg' ? 'jpg' : actualFormat;
        optimized = {
          name: articleImageName(index, output.mime || contentType, extension),
          type: output.mime || output.blob.type,
          size: output.blob.size,
          blob: output.blob,
          keptOriginal: output.meta.keptOriginal,
          width: output.meta?.width,
          height: output.meta?.height,
        };
      } catch {
        optimized = null;
      }
    }
    images.push({
      number: index + 1,
      name: originalName,
      contentType,
      blob: originalBlob,
      size: originalBlob.size,
      optimized,
    });
    await yieldToBrowser();
  }

  onProgress(89, 'Очищаем и форматируем HTML');
  await yieldToBrowser();
  const cleanResult = prepareArticleHtml(extracted.sourceHtml, options, images);
  const imagesWithPreviews = images.map((image) => {
    const dataUrl = URL.createObjectURL(image.blob);
    if (!image.optimized) return { ...image, dataUrl };
    return {
      ...image,
      dataUrl,
      optimized: {
        ...image.optimized,
        dataUrl: image.optimized.blob === image.blob
          ? dataUrl
          : URL.createObjectURL(image.optimized.blob),
      },
    };
  });
  onProgress(100, 'Готово');
  return {
    sourceHtml: extracted.sourceHtml,
    cleanedHtml: cleanResult.html,
    markdown: htmlToMarkdown(cleanResult.html),
    plainText: htmlToPlainText(cleanResult.html),
    images: imagesWithPreviews,
    fixes: cleanResult.fixes,
    messages: extracted.messages || [],
  };
}

export async function downloadImagesZip(images, baseName) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const folder = zip.folder('images');
  images.forEach((image) => {
    if (image.optimized) folder.file(image.optimized.name, image.optimized.blob);
    else folder.file(image.name, image.blob);
  });
  folder.file('manifest.json', JSON.stringify(imageManifest(images), null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(blob, sanitizeFileName(baseName) + '_images.zip');
}

export async function downloadArticlePackage(html, images, baseName) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const safeBaseName = sanitizeFileName(baseName || 'document');
  const root = zip.folder(safeBaseName);
  const imagesFolder = root.folder('images');
  const title = safeBaseName.replace(/[&<>"']/g, '');
  root.file(safeBaseName + '.html', `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;font:18px/1.7 system-ui;color:#242939;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ddd;padding:8px}pre{overflow:auto}</style></head><body>${html}</body></html>`);
  root.file(safeBaseName + '.md', htmlToMarkdown(html));
  root.file(safeBaseName + '.txt', htmlToPlainText(html));
  images.forEach((image) => {
    if (image.optimized) imagesFolder.file(image.optimized.name, image.optimized.blob);
    else imagesFolder.file(image.name, image.blob);
  });
  root.file('manifest.json', JSON.stringify(imageManifest(images), null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(blob, safeBaseName + '_article.zip');
}
