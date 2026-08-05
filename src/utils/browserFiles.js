import { sanitizeFileName } from './fileConverters';

export function base64ToBlob(base64, contentType) {
  const binary = atob(base64);
  const chunks = [];
  for (let offset = 0; offset < binary.length; offset += 8192) {
    const slice = binary.slice(offset, offset + 8192);
    const bytes = new Uint8Array(slice.length);
    for (let index = 0; index < slice.length; index += 1) bytes[index] = slice.charCodeAt(index);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: contentType });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName || 'lotus-result');
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(content, fileName, type) {
  downloadBlob(new Blob(['\ufeff', content], { type }), fileName);
}

export async function loadJSZip() {
  const module = await import('jszip');
  return module.default || module;
}

export async function downloadResults(results, archiveName) {
  const available = results.filter((item) => item.blob);
  if (!available.length) throw new Error('Нет готовых файлов для скачивания.');
  if (available.length === 1) {
    downloadBlob(available[0].blob, available[0].fileName);
    return;
  }
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  addUniqueZipFiles(zip, available);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(blob, archiveName);
}

export function yieldToBrowser() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 80 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

export function addUniqueZipFiles(zip, files) {
  const usedNames = new Set();
  files.forEach((item) => {
    const originalName = sanitizeFileName(item.fileName || 'result');
    const dotIndex = originalName.lastIndexOf('.');
    const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
    const extension = dotIndex > 0 ? originalName.slice(dotIndex) : '';
    let candidate = originalName;
    let suffix = 2;
    while (usedNames.has(candidate.toLocaleLowerCase('ru-RU'))) {
      candidate = base + ' (' + suffix + ')' + extension;
      suffix += 1;
    }
    usedNames.add(candidate.toLocaleLowerCase('ru-RU'));
    zip.file(candidate, item.blob);
  });
}
