import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const routes = [
  { id: 'conversions', label: 'Конвертер' },
  { id: 'optimize', label: 'Оптимизация' },
  { id: 'articles', label: 'Разместим статью быстро', cta: true },
];

const conversionServices = [
  { title: 'Разместим статью быстро', text: 'DOCX превращается в HTML, изображения и готовый архив для сайта.', page: 'articles' },
  { title: 'Конвертер изображений', text: 'Загрузите файлы и получите JPEG, WebP или PNG уже оптимизированными.', page: 'conversions' },
  { title: 'Оптимизация изображений', text: 'Уменьшите вес картинок для сайта без лишних настроек.', page: 'optimize' },
];

const DOCX_MIME_TYPES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
};
const OUTPUT_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const SERVICE_LINK_PATTERNS = /skr\.sh|screenshot|docs\.google\.com\/document\/d\//i;
const SAFE_HREF_PATTERN = /^(https?:|mailto:|tel:|#|\/)/i;
const SAFE_IMAGE_SRC_PATTERN = /^(data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,|https?:|\/|\.\/|\.\.\/)/i;
const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['colspan', 'rowspan']);
const LINK_ALLOWED_ATTRIBUTES = new Set(['href']);
const IMAGE_ALLOWED_ATTRIBUTES = new Set(['src', 'alt', 'title', 'width', 'height', 'data-image-number']);
const WEB_IMAGE_QUALITY = 0.92;
const WEB_IMAGE_MAX_WIDTH = 1920;

async function loadMammoth() {
  const module = await import('mammoth/mammoth.browser');
  return module.default || module;
}

async function loadJSZip() {
  const module = await import('jszip');
  return module.default || module;
}

const FIX_LABELS = {
  anchors: 'Удалены пустые служебные якоря',
  headingStrong: 'Убраны лишние strong внутри заголовков',
  tables: 'Нормализована структура таблиц',
  cells: 'Упрощены ячейки таблиц',
  serviceLinks: 'Очищены служебные ссылки',
  emptyParagraphs: 'Удалены пустые абзацы',
  emptySpans: 'Удалены пустые span-обертки',
  attributes: 'Удалены inline-стили, классы и небезопасные атрибуты',
  brokenTags: 'Исправлены разорванные теги',
  images: 'Изображения пронумерованы в порядке документа',
  whitespace: 'Нормализованы пробелы и переносы строк',
  listClasses: 'Добавлены классы для списков',
  tableClasses: 'Добавлены классы для таблиц',
  tableWrappers: 'Добавлены обертки для таблиц',
};

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function getRouteFromHash() {
  const route = window.location.hash.replace('#/', '') || 'home';
  return route === 'home' || routes.some((item) => item.id === route) ? route : 'home';
}

function setRoute(route) {
  window.location.hash = `/${route}`;
}

function getBaseName(fileName) {
  return (fileName || 'document').replace(/\.[^.]+$/i, '') || 'document';
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizeTextValue(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/\s+([,.;:!?%])/g, '$1')
    .replace(/([«„])\s+/g, '$1')
    .replace(/\s+([»“])/g, '$1');
}

function fixBrokenTags(html) {
  let fixed = 0;
  html = html.replace(/<a\b([^>]*?)>\s*<\/(?:p|li|h[1-6])>\s*<(?:p|li|h[1-6])[^>]*?>/gi, (match) => {
    fixed++;
    return match.replace(/<\/[^>]+>\s*<[^>]+>/g, '');
  });
  html = html.replace(/<a\b[^>]*?>\s*<\/a>/gi, () => {
    fixed++;
    return '';
  });
  html = html.replace(/<\/(strong|em|code|b|i)>\s*<\1>/gi, () => {
    fixed++;
    return '';
  });
  return { html, fixed };
}

function createCounters() {
  return Object.keys(FIX_LABELS).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
}

function replaceElementWithChildren(element) {
  element.replaceWith(...Array.from(element.childNodes));
}

function normalizeClassValue(value) {
  return value.trim().split(/\s+/).filter(Boolean).join(' ');
}

function numberImages(doc) {
  const images = Array.from(doc.querySelectorAll('img'));
  images.forEach((image, index) => {
    const number = index + 1;
    image.setAttribute('alt', image.getAttribute('alt') || `Изображение ${number}`);
    image.setAttribute('data-image-number', String(number));
    image.replaceWith(doc.createComment(` img${number} `));
  });
  doc.querySelectorAll('figure').forEach((figure) => replaceElementWithChildren(figure));
  return images.length;
}

function normalizeTable(table, doc) {
  const thead = table.querySelector(':scope > thead');
  const directRows = Array.from(table.children).filter((child) => child.tagName === 'TR');
  let fixed = 0;
  if (directRows.length) {
    const tbody = doc.createElement('tbody');
    directRows.forEach((row) => tbody.appendChild(row));
    table.appendChild(tbody);
    fixed = 1;
  }
  if (!thead) return fixed;
  const rows = Array.from(thead.querySelectorAll(':scope > tr'));
  if (rows.length <= 1) return fixed;
  let tbody = table.querySelector(':scope > tbody');
  if (!tbody) {
    tbody = doc.createElement('tbody');
    table.appendChild(tbody);
  }
  rows.slice(1).forEach((row) => {
    row.querySelectorAll('th').forEach((th) => {
      const td = doc.createElement('td');
      td.innerHTML = th.innerHTML;
      th.replaceWith(td);
    });
    tbody.appendChild(row);
  });
  return 1;
}

function stripUnsafeAttributes(element) {
  let removed = 0;
  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      removed++;
      return;
    }
    if (name === 'href' && (!LINK_ALLOWED_ATTRIBUTES.has(name) || !SAFE_HREF_PATTERN.test(value))) {
      element.removeAttribute(attribute.name);
      removed++;
      return;
    }
    if (name === 'src' && element.tagName === 'IMG' && !SAFE_IMAGE_SRC_PATTERN.test(value)) {
      element.removeAttribute(attribute.name);
      removed++;
      return;
    }
    const allowedAttributes = element.tagName === 'A'
      ? new Set([...GLOBAL_ALLOWED_ATTRIBUTES, ...LINK_ALLOWED_ATTRIBUTES])
      : element.tagName === 'IMG'
        ? new Set([...GLOBAL_ALLOWED_ATTRIBUTES, ...IMAGE_ALLOWED_ATTRIBUTES])
        : GLOBAL_ALLOWED_ATTRIBUTES;
    if (!allowedAttributes.has(name)) {
      element.removeAttribute(attribute.name);
      removed++;
    }
  });
  return removed;
}

function applyCustomOutputOptions(doc, options) {
  const ulClass = normalizeClassValue(options.ulClass);
  const tableClass = normalizeClassValue(options.tableClass);
  const wrapperClass = normalizeClassValue(options.tableWrapperClass);
  const counters = { listClasses: 0, tableClasses: 0, tableWrappers: 0 };
  if (ulClass) {
    doc.querySelectorAll('ul').forEach((list) => {
      list.setAttribute('class', ulClass);
      counters.listClasses++;
    });
  }
  if (tableClass) {
    doc.querySelectorAll('table').forEach((table) => {
      table.setAttribute('class', tableClass);
      counters.tableClasses++;
    });
  }
  if (wrapperClass) {
    doc.querySelectorAll('table').forEach((table) => {
      const wrapper = doc.createElement('div');
      wrapper.setAttribute('class', wrapperClass);
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
      counters.tableWrappers++;
    });
  }
  return counters;
}

function normalizeDocumentTextNodes(doc) {
  let fixed = 0;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const original = node.nodeValue || '';
    const normalized = normalizeTextValue(original);
    if (normalized !== original) {
      node.nodeValue = normalized;
      fixed = 1;
    }
  });
  return fixed;
}

function createFixList(counters) {
  return Object.entries(FIX_LABELS)
    .filter(([key]) => counters[key] > 0)
    .map(([key, label]) => `${label}: ${counters[key]}`);
}

function formatHtml(html) {
  const indent = '  ';
  const voidElements = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const blockElements = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'table', 'thead', 'tbody', 'tr', 'ul', 'ol', 'li', 'blockquote', 'div', 'section', 'article', 'figure']);
  const doc = parseHtml(html);
  const hasBlockChild = (element) => Array.from(element.children).some((child) => blockElements.has(child.tagName.toLowerCase()));
  const normalizeText = (value) => normalizeTextValue(value).trim();
  const getOpeningTag = (element) => element.outerHTML.match(/^<[^>]+>/)?.[0] || `<${element.tagName.toLowerCase()}>`;
  const shouldInsertSpace = (left, right) => {
    if (!left?.text || !right?.text) return false;
    const leftChar = left.text.slice(-1);
    const rightChar = right.text.charAt(0);
    if (/^[,.;:!?%»”)\]}]/.test(rightChar)) return false;
    if (/[«„([{]$/.test(leftChar)) return false;
    if (leftChar === '-' || rightChar === '-') return false;
    if (/\d/.test(leftChar) && /\d/.test(rightChar)) return false;
    return true;
  };
  const joinInlineParts = (parts) => {
    let previous = null;
    return parts.reduce((htmlValue, part) => {
      if (!part.html) return htmlValue;
      const separator = shouldInsertSpace(previous, part) ? ' ' : '';
      if (part.text) previous = part;
      return `${htmlValue}${separator}${part.html}`;
    }, '').trim();
  };
  const renderInlinePart = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent || '');
      return { html: text, text };
    }
    if (node.nodeType === Node.COMMENT_NODE) return { html: `<!--${node.nodeValue}-->`, text: '' };
    if (node.nodeType !== Node.ELEMENT_NODE) return { html: '', text: '' };
    const tagName = node.tagName.toLowerCase();
    if (voidElements.has(tagName)) return { html: node.outerHTML, text: normalizeText(node.textContent || '') };
    const innerHtml = joinInlineParts(Array.from(node.childNodes).map(renderInlinePart));
    return { html: `${getOpeningTag(node)}${innerHtml}</${tagName}>`, text: normalizeText(node.textContent || '') };
  };
  const renderNode = (node, depth = 0) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent || '');
      return text ? [`${indent.repeat(depth)}${text}`] : [];
    }
    if (node.nodeType === Node.COMMENT_NODE) return [`${indent.repeat(depth)}<!--${node.nodeValue}-->`];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tagName = node.tagName.toLowerCase();
    if (voidElements.has(tagName)) return [`${indent.repeat(depth)}${node.outerHTML}`];
    const children = Array.from(node.childNodes);
    const shouldStayInline = !hasBlockChild(node) && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'figure'].includes(tagName);
    if (shouldStayInline) {
      const innerHtml = joinInlineParts(children.map(renderInlinePart));
      return [`${indent.repeat(depth)}${getOpeningTag(node)}${innerHtml}</${tagName}>`];
    }
    const lines = [`${indent.repeat(depth)}${getOpeningTag(node)}`];
    children.forEach((child) => lines.push(...renderNode(child, depth + 1)));
    lines.push(`${indent.repeat(depth)}</${tagName}>`);
    return lines;
  };
  return Array.from(doc.body.childNodes)
    .map((node) => renderNode(node).join('\n'))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanDocumentHtml(html, options) {
  const { html: fixedHtml, fixed: brokenFixed } = fixBrokenTags(html);
  const doc = parseHtml(fixedHtml);
  const counters = createCounters();
  counters.brokenTags = brokenFixed;
  counters.images = numberImages(doc);
  doc.querySelectorAll('a[id^="_"]').forEach((anchor) => {
    if (!anchor.textContent.trim() && anchor.children.length === 0) {
      counters.anchors++;
      anchor.remove();
    }
  });
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    heading.querySelectorAll('strong').forEach((strong) => {
      counters.headingStrong++;
      strong.replaceWith(...strong.childNodes);
    });
  });
  doc.querySelectorAll('table').forEach((table) => {
    counters.tables += normalizeTable(table, doc);
  });
  doc.querySelectorAll('td, th').forEach((cell) => {
    const childElements = Array.from(cell.children);
    if (childElements.length === 1 && childElements[0].tagName === 'P') {
      counters.cells++;
      childElements[0].replaceWith(...childElements[0].childNodes);
    }
  });
  doc.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (SERVICE_LINK_PATTERNS.test(href)) {
      counters.serviceLinks++;
      link.replaceWith(...link.childNodes);
    }
  });
  doc.querySelectorAll('span').forEach((span) => {
    if (!span.attributes.length && !span.children.length && !span.textContent.trim()) {
      counters.emptySpans++;
      span.remove();
    }
  });
  doc.querySelectorAll('p').forEach((paragraph) => {
    if (!paragraph.textContent.trim() && !paragraph.querySelector('img') && !paragraph.children.length) {
      counters.emptyParagraphs++;
      paragraph.remove();
    }
  });
  doc.body.querySelectorAll('*').forEach((element) => {
    counters.attributes += stripUnsafeAttributes(element);
  });
  const customCounters = applyCustomOutputOptions(doc, options);
  counters.listClasses = customCounters.listClasses;
  counters.tableClasses = customCounters.tableClasses;
  counters.tableWrappers = customCounters.tableWrappers;
  counters.whitespace = normalizeDocumentTextNodes(doc);
  return { html: formatHtml(doc.body.innerHTML), fixes: createFixList(counters) };
}

function htmlToPlainText(html) {
  const doc = parseHtml(html);
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr').forEach((element) => {
    element.appendChild(doc.createTextNode('\n'));
  });
  return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToMarkdown(html) {
  const doc = parseHtml(html);
  const inline = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return normalizeTextValue(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const content = Array.from(node.childNodes).map(inline).join('').trim();
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'code') return `\`${content}\``;
    if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`;
    if (tag === 'br') return '\n';
    return content;
  };
  const block = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return normalizeTextValue(node.textContent || '').trim();
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const text = Array.from(node.childNodes).map(inline).join('').trim();
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${text}`;
    if (tag === 'p') return text;
    if (tag === 'li') return `- ${text}`;
    if (tag === 'ul' || tag === 'ol') return Array.from(node.children).map(block).join('\n');
    if (tag === 'blockquote') return text.split('\n').map((line) => `> ${line}`).join('\n');
    if (tag === 'table') return tableToMarkdown(node);
    return Array.from(node.childNodes).map(block).filter(Boolean).join('\n\n');
  };
  return Array.from(doc.body.childNodes)
    .map(block)
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) => (
    Array.from(row.children).map((cell) => normalizeTextValue(cell.textContent || '').trim())
  ));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const normalizeRow = (row) => Array.from({ length: width }, (_, index) => row[index] || '');
  const [head, ...body] = rows.map(normalizeRow);
  const separator = Array.from({ length: width }, () => '---');
  return [head, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function imageFileName(index, contentType, extensionOverride) {
  const ext = extensionOverride || IMAGE_EXTENSIONS[contentType] || 'bin';
  return `article-image-${String(index + 1).padStart(3, '0')}.${ext}`;
}

function base64ToBlob(base64, contentType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(content, fileName, type) {
  downloadBlob(new Blob([content], { type }), fileName);
}

function imageManifest(images) {
  return images.map(({ number, name, contentType, size, optimized }) => ({
    number,
    fileName: optimized?.name || name,
    originalType: contentType,
    outputType: optimized?.type || contentType,
    originalSize: size,
    outputSize: optimized?.size || size,
  }));
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function optimizeImageSource(source, outputFormat) {
  const bitmap = await createImageBitmap(source);
  const ratio = Math.min(1, WEB_IMAGE_MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: outputFormat === 'png' });
  if (outputFormat === 'jpeg') {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  const type = OUTPUT_MIME[outputFormat];
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, WEB_IMAGE_QUALITY));
  if (!blob) throw new Error('Браузер не смог обработать изображение.');
  const dataUrl = await blobToDataUrl(blob);
  return { blob, dataUrl, width, height, type };
}

async function extractDocument(file, options) {
  const mammoth = await loadMammoth();
  const images = [];
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const index = images.length;
        const contentType = image.contentType || 'application/octet-stream';
        const base64 = await image.read('base64');
        const name = imageFileName(index, contentType);
        const dataUrl = `data:${contentType};base64,${base64}`;
        const originalBlob = base64ToBlob(base64, contentType);
        let optimized = null;
        if (!contentType.includes('svg')) {
          try {
            const output = await optimizeImageSource(originalBlob, options.imageExtension);
            optimized = {
              name: imageFileName(index, contentType, options.imageExtension === 'jpeg' ? 'jpg' : options.imageExtension),
              type: output.type,
              size: output.blob.size,
              blob: output.blob,
              dataUrl: output.dataUrl,
              width: output.width,
              height: output.height,
            };
          } catch {
            optimized = null;
          }
        }
        images.push({
          number: index + 1,
          name,
          contentType,
          base64,
          dataUrl,
          size: Math.ceil((base64.length * 3) / 4),
          optimized,
        });
        return { src: dataUrl, alt: `Изображение ${index + 1}`, 'data-image-number': String(index + 1) };
      }),
    }
  );
  const cleanResult = cleanDocumentHtml(result.value, options);
  return {
    sourceHtml: result.value,
    cleanedHtml: cleanResult.html,
    markdown: htmlToMarkdown(cleanResult.html),
    plainText: htmlToPlainText(cleanResult.html),
    images,
    fixes: cleanResult.fixes,
    messages: result.messages || [],
  };
}

async function downloadImagesZip(images, baseName, optimizedOnly = true) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const folder = zip.folder('images');
  images.forEach((image) => {
    if (optimizedOnly && image.optimized) {
      folder.file(image.optimized.name, image.optimized.blob);
      return;
    }
    folder.file(image.name, image.base64, { base64: true });
  });
  folder.file('manifest.json', JSON.stringify(imageManifest(images), null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${baseName}_images.zip`);
}

async function downloadArticlePackage(html, images, baseName) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder(baseName);
  const imagesFolder = root.folder('images');
  root.file(`${baseName}.html`, html);
  images.forEach((image) => {
    if (image.optimized) {
      imagesFolder.file(image.optimized.name, image.optimized.blob);
      return;
    }
    imagesFolder.file(image.name, image.base64, { base64: true });
  });
  root.file('manifest.json', JSON.stringify(imageManifest(images), null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${baseName}_article.zip`);
}

function getHtmlStats(html, images) {
  const doc = parseHtml(html);
  return [
    { label: 'Заголовков', value: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length },
    { label: 'Таблиц', value: doc.querySelectorAll('table').length },
    { label: 'Ссылок', value: doc.querySelectorAll('a').length },
    { label: 'Списков', value: doc.querySelectorAll('ul, ol').length },
    { label: 'Изображений', value: images.length },
  ];
}

function Header({ route }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-header__brand" href="#/home" aria-label="Lotus Docs">
          <img className="site-header__logo" src="/lotus.svg" alt="" />
          <span>Lotus Docs</span>
        </a>
        <nav className="site-header__nav" aria-label="Основная навигация">
          {routes.map((item) => (
            <a className={`site-header__link ${item.cta ? 'site-header__link--cta' : ''} ${route === item.id ? 'site-header__link--active' : ''}`} key={item.id} href={`#/${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">Lotus Docs</p>
          <h1 className="hero__title">Lotus Docs</h1>
          <p className="hero__text">
            Минималистичный набор инструментов для публикации: чистый HTML из DOCX, легкие изображения и готовые архивы для сайта.
          </p>
          <div className="hero__actions">
            <button className="button" type="button" onClick={() => setRoute('articles')}>Разместить статью</button>
            <button className="button button--secondary" type="button" onClick={() => setRoute('conversions')}>Конвертировать изображения</button>
          </div>
        </div>
      </section>

      <section className="tools-grid" aria-label="Доступные сервисы">
        {conversionServices.map((service) => (
          <button className="tool-card" key={service.title} type="button" onClick={() => setRoute(service.page)}>
            <span className="tool-card__title">{service.title}</span>
            <span className="tool-card__text">{service.text}</span>
          </button>
        ))}
      </section>
    </>
  );
}

function Settings({ options, onOptionsChange }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <section className="settings" aria-label="Настройки экспорта">
      <div className="field field--static">
        <span className="field__label">Изображения в HTML</span>
        <strong className="field__value">&lt;!-- img1 --&gt;</strong>
      </div>
      <label className="field">
        <span className="field__label">Формат картинок</span>
        <select className="field__control" value={options.imageExtension} onChange={(event) => onOptionsChange({ imageExtension: event.target.value })}>
          <option value="webp">WebP</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </label>
      <button className="button button--secondary settings__advanced-button" type="button" onClick={() => setAdvancedOpen((value) => !value)}>
        {advancedOpen ? 'Скрыть доп параметры' : 'Доп параметры'}
      </button>
      {advancedOpen && (
        <div className="settings__advanced">
          <label className="field">
            <span className="field__label">Класс ul</span>
            <input className="field__control" type="text" value={options.ulClass} placeholder="content-list" onChange={(event) => onOptionsChange({ ulClass: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Класс table</span>
            <input className="field__control" type="text" value={options.tableClass} placeholder="content-table" onChange={(event) => onOptionsChange({ tableClass: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Класс обертки table</span>
            <input className="field__control" type="text" value={options.tableWrapperClass} placeholder="table-container" onChange={(event) => onOptionsChange({ tableWrapperClass: event.target.value })} />
          </label>
        </div>
      )}
    </section>
  );
}

function ArticleConverterPage() {
  const [state, setState] = useState({
    selectedFile: null,
    fileName: '',
    sourceHtml: '',
    cleanedHtml: '',
    markdown: '',
    plainText: '',
    images: [],
    fixes: [],
    messages: [],
    activeTab: 'html',
    status: 'idle',
    error: '',
    copyStatus: 'idle',
  });
  const [options, setOptions] = useState({
    ulClass: '',
    tableClass: '',
    tableWrapperClass: '',
    imageExtension: 'png',
  });
  const fileInputRef = useRef(null);
  const baseName = getBaseName(state.fileName);

  const convertDocument = async (file = state.selectedFile, nextOptions = options) => {
    if (!file) return;
    setState((current) => ({ ...current, status: 'converting', error: '', copyStatus: 'idle' }));
    try {
      const result = await extractDocument(file, nextOptions);
      setState((current) => ({ ...current, ...result, selectedFile: file, fileName: file.name, status: 'converted', error: '' }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? `Не удалось обработать документ: ${error.message}` : 'Не удалось обработать документ.',
      }));
    }
  };

  React.useEffect(() => {
    const handleEnter = (event) => {
      if (event.key !== 'Enter' || !state.selectedFile || state.status === 'converting') return;
      event.preventDefault();
      void convertDocument();
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [state.selectedFile, state.status, options]);

  const updateOptions = (patch) => {
    const nextOptions = { ...options, ...patch };
    setOptions(nextOptions);
    if (state.sourceHtml) {
      const cleanResult = cleanDocumentHtml(state.sourceHtml, nextOptions);
      setState((current) => ({
        ...current,
        cleanedHtml: cleanResult.html,
        markdown: htmlToMarkdown(cleanResult.html),
        plainText: htmlToPlainText(cleanResult.html),
        fixes: cleanResult.fixes,
      }));
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setState((current) => ({ ...current, status: 'error', error: 'Выберите файл Word в формате .docx.' }));
      return;
    }
    setState((current) => ({
      ...current,
      selectedFile: file,
      fileName: file.name,
      sourceHtml: '',
      cleanedHtml: '',
      markdown: '',
      plainText: '',
      images: [],
      fixes: [],
      messages: [],
      activeTab: 'html',
      status: 'ready',
      error: '',
      copyStatus: 'idle',
    }));
  };

  const copyValue = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setState((current) => ({ ...current, copyStatus: 'copied' }));
      setTimeout(() => setState((current) => ({ ...current, copyStatus: 'idle' })), 1600);
    } catch {
      setState((current) => ({ ...current, error: 'Браузер не разрешил скопировать результат в буфер обмена.' }));
    }
  };

  const downloadCurrent = (type, content) => {
    const formats = {
      html: { ext: 'html', mime: 'text/html;charset=utf-8' },
      markdown: { ext: 'md', mime: 'text/markdown;charset=utf-8' },
      text: { ext: 'txt', mime: 'text/plain;charset=utf-8' },
      manifest: { ext: 'json', mime: 'application/json;charset=utf-8' },
    };
    const format = formats[type] || formats.html;
    downloadText(content, `${baseName}_lotus.${format.ext}`, format.mime);
  };

  return (
    <section className="page">
      <div className="page-head">
        <p className="page-head__eyebrow">DOCX в HTML</p>
        <h1 className="page-head__title">Разместим статью быстро</h1>
        <p className="page-head__text">Загрузите документ и получите готовый комплект для публикации: HTML статьи, папку images и manifest в одном архиве.</p>
      </div>

      <div className="upload-row">
        <button className="upload-zone" type="button" onClick={() => fileInputRef.current?.click()}>
          <span className="upload-zone__badge">DOCX</span>
          <span className="upload-zone__title">{state.fileName || 'Загрузить DOCX'}</span>
          <span className="upload-zone__hint">Word или экспорт Google Docs в .docx</span>
        </button>
        <input className="hidden-input" ref={fileInputRef} type="file" accept={`.docx,${DOCX_MIME_TYPES.join(',')}`} onChange={(event) => handleFile(event.target.files?.[0])} />
        <button className="button" type="button" disabled={!state.selectedFile || state.status === 'converting'} onClick={() => convertDocument()}>
          {state.status === 'converting' ? 'Обработка...' : state.cleanedHtml ? 'Обновить результат' : 'Обработать статью'}
        </button>
      </div>
      {state.error && <p className="message message--error">{state.error}</p>}

      <Settings options={options} onOptionsChange={updateOptions} />
      <ResultPanel state={state} baseName={baseName} onCopy={copyValue} onDownload={downloadCurrent} onTabChange={(tab) => setState((current) => ({ ...current, activeTab: tab }))} />
      <ImagesPanel images={state.images} baseName={baseName} />
    </section>
  );
}

function Stats({ html, images }) {
  const stats = useMemo(() => getHtmlStats(html, images), [html, images]);
  return (
    <section className="stats" aria-label="Статистика документа">
      {stats.map((item) => (
        <article className="stats__item" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </article>
      ))}
    </section>
  );
}

function ResultPanel({ state, baseName, onCopy, onDownload, onTabChange }) {
  if (!state.cleanedHtml) return null;
  const tabs = [
    { id: 'html', label: 'HTML', content: state.cleanedHtml },
    { id: 'markdown', label: 'Markdown', content: state.markdown },
    { id: 'text', label: 'Text', content: state.plainText },
    { id: 'manifest', label: 'Manifest', content: JSON.stringify(imageManifest(state.images), null, 2) },
  ];
  const current = tabs.find((tab) => tab.id === state.activeTab) || tabs[0];
  return (
    <section className="result" aria-label="Результат конвертации">
      <div className="result__top">
        <div className="tabs" role="tablist" aria-label="Форматы результата">
          {tabs.map((tab) => (
            <button className={`tabs__button ${state.activeTab === tab.id ? 'tabs__button--active' : ''}`} key={tab.id} type="button" onClick={() => onTabChange(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="button button--secondary" type="button" onClick={() => onCopy(current.content)}>
            {state.copyStatus === 'copied' ? 'Скопировано' : `Копировать ${current.label}`}
          </button>
          <button className="button button--secondary" type="button" onClick={() => onDownload(current.id, current.content)}>Скачать {current.label}</button>
          <button className="button" type="button" onClick={() => downloadArticlePackage(state.cleanedHtml, state.images, baseName)}>Скачать все</button>
        </div>
      </div>
      <Stats html={state.cleanedHtml} images={state.images} />
      <div className="result__grid">
        <article className="panel">
          <header className="panel__header">HTML текст</header>
          <div className="panel__body">
            <pre className="code-block">{current.content}</pre>
          </div>
        </article>
        <article className="panel">
          <header className="panel__header">Предпросмотр</header>
          <div className="panel__body panel__body--preview" dangerouslySetInnerHTML={{ __html: state.cleanedHtml }} />
        </article>
      </div>
      <article className="fixes">
        <h2>Обработка</h2>
        <ul>
          {state.fixes.length ? state.fixes.map((fix) => <li key={fix}>{fix}</li>) : <li>Документ уже был достаточно чистым.</li>}
          {state.messages.map((message, index) => <li key={`${message.type}-${index}`}>{message.message}</li>)}
        </ul>
      </article>
    </section>
  );
}

function ImagesPanel({ images, baseName }) {
  if (!images.length) return null;
  const saved = images.reduce((sum, image) => sum + Math.max(0, image.size - (image.optimized?.size || image.size)), 0);
  return (
    <section className="images-panel" aria-label="Изображения после HTML">
      <div className="section-head">
        <div>
          <h2>Изображения после текста HTML</h2>
          <p>Сначала выводится код статьи, затем файлы картинок для загрузки на сайт.</p>
        </div>
        <div className="actions">
          <span className="saving">Экономия: {formatBytes(saved)}</span>
          <button className="button button--secondary" type="button" onClick={() => downloadImagesZip(images, baseName, true)}>Скачать ZIP</button>
        </div>
      </div>
      <div className="image-grid">
        {images.map((image) => {
          const file = image.optimized || image;
          const src = image.optimized?.dataUrl || image.dataUrl;
          const size = image.optimized?.size || image.size;
          return (
            <article className="image-card" key={image.name}>
              <div className="image-card__media">
                <img src={src} alt={`Изображение ${image.number}`} />
              </div>
              <div className="image-card__body">
                <strong>{file.name}</strong>
                <span>#{image.number} · {file.type || image.contentType}</span>
                <span>{formatBytes(image.size)} → {formatBytes(size)}</span>
                <button className="button button--secondary" type="button" onClick={() => downloadBlob(file.blob || base64ToBlob(image.base64, image.contentType), file.name)}>
                  Скачать
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ImageToolsPage({ optimizeOnly = false }) {
  const [format, setFormat] = useState(optimizeOnly ? 'webp' : 'jpeg');
  const [items, setItems] = useState([]);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [status, setStatus] = useState('');
  const inputRef = useRef(null);

  const processFiles = async (files, remember = true) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    if (remember) setSourceFiles(imageFiles);
    setStatus('Оптимизация...');
    const processed = [];
    for (const file of imageFiles) {
      try {
        const result = await optimizeImageSource(file, format);
        const extension = format === 'jpeg' ? 'jpg' : format;
        processed.push({
          id: `${file.name}-${file.lastModified}`,
          name: file.name,
          outputName: `${getBaseName(file.name)}.${extension}`,
          originalSize: file.size,
          outputSize: result.blob.size,
          width: result.width,
          height: result.height,
          type: result.type,
          blob: result.blob,
          preview: result.dataUrl,
        });
      } catch (error) {
        processed.push({ id: `${file.name}-${file.lastModified}`, name: file.name, error: error instanceof Error ? error.message : 'Ошибка обработки' });
      }
    }
    setItems(processed);
    setStatus('');
  };

  React.useEffect(() => {
    if (sourceFiles.length) void processFiles(sourceFiles, false);
  }, [format]);

  const downloadAll = async () => {
    if (items.filter((item) => item.blob).length === 1) {
      const item = items.find((entry) => entry.blob);
      downloadBlob(item.blob, item.outputName);
      return;
    }
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    items.filter((item) => item.blob).forEach((item) => zip.file(item.outputName, item.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'lotus-optimized-images.zip');
  };

  return (
    <section className="page">
      <div className="page-head">
        <p className="page-head__eyebrow">{optimizeOnly ? 'Оптимизация' : 'Конвертация'}</p>
        <h1 className="page-head__title">{optimizeOnly ? 'Оптимизация изображений' : 'Конвертер изображений'}</h1>
        <p className="page-head__text">
          {optimizeOnly
            ? 'Загрузите изображения и получите легкие версии для сайта. Сервис сам подберет разумный веб-размер и сохранит визуальное качество.'
            : 'Добавьте исходники, выберите формат и скачайте готовые оптимизированные файлы.'}
        </p>
      </div>
      <div className="conversion-workspace">
        <section className="conversion-column">
          <div className="column-head">
            <span>1</span>
            <strong>Исходник</strong>
          </div>
          <button className="upload-zone" type="button" onClick={() => inputRef.current?.click()}>
            <span className="upload-zone__badge">IMG</span>
            <span className="upload-zone__title">Загрузить изображения</span>
            <span className="upload-zone__hint">PNG, JPEG, WebP, BMP. Один файл или сразу несколько.</span>
          </button>
          <input className="hidden-input" ref={inputRef} type="file" accept="image/*" multiple onChange={(event) => processFiles(event.target.files)} />
        </section>
        <section className="conversion-column conversion-column--target">
          <div className="column-head">
            <span>2</span>
            <strong>{optimizeOnly ? 'Оптимизация' : 'Во что конвертировать'}</strong>
          </div>
          <div className="target-panel">
            {!optimizeOnly && (
              <label className="field">
                <span className="field__label">Формат результата</span>
                <select className="field__control" value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="jpeg">IMG to JPEG</option>
                  <option value="webp">IMG to WebP</option>
                  <option value="png">IMG to PNG</option>
                </select>
              </label>
            )}
            {optimizeOnly && (
              <label className="field">
                <span className="field__label">Формат результата</span>
                <select className="field__control" value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="webp">WebP для сайта</option>
                  <option value="jpeg">JPEG для сайта</option>
                  <option value="png">PNG без потерь</option>
                </select>
              </label>
            )}
            <p className="target-panel__note">На выходе файл уже готов для сайта: легче по весу, без лишних ручных настроек и с бережным отношением к качеству.</p>
            <button className="button" type="button" disabled={!items.some((item) => item.blob)} onClick={downloadAll}>
              {items.filter((item) => item.blob).length > 1 ? 'Скачать архив' : 'Скачать изображение'}
            </button>
          </div>
        </section>
      </div>
      {status && <p className="message">{status}</p>}
      <div className="image-grid">
        {items.map((item) => (
          <article className="image-card" key={item.id}>
            {item.preview && (
              <div className="image-card__media">
                <img src={item.preview} alt={item.name} />
              </div>
            )}
            <div className="image-card__body">
              <strong>{item.outputName || item.name}</strong>
              {item.error ? <span>{item.error}</span> : <span>{formatBytes(item.originalSize)} → {formatBytes(item.outputSize)} · {item.width}x{item.height}</span>}
              {item.blob && <button className="button button--secondary" type="button" onClick={() => downloadBlob(item.blob, item.outputName)}>Скачать</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <a className="site-footer__brand" href="#/home">
          <img src="/lotus.svg" alt="" />
          <span>Lotus Docs</span>
        </a>
        <p>Конвертер статей и изображений для сайта</p>
        <nav aria-label="Контакты">
          <a href="https://t.me/itakash1" target="_blank" rel="noreferrer">Telegram</a>
          <a href="https://github.com/itakash1" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}

function App() {
  const [route, setCurrentRoute] = useState(getRouteFromHash);
  React.useEffect(() => {
    const onHashChange = () => setCurrentRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#/home');
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return (
    <div className="app">
      <Header route={route} />
      <main className="app__main">
        <div className="app__container">
          {route === 'home' && <HomePage />}
          {route === 'conversions' && <ImageToolsPage key="conversions" />}
          {route === 'optimize' && <ImageToolsPage key="optimize" optimizeOnly />}
          {route === 'articles' && <ArticleConverterPage />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
