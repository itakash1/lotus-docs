const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const INLINE_REPAIR_TAGS = new Set([
  'a',
  'b',
  'code',
  'del',
  'em',
  'i',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
]);

const REPAIRABLE_BLOCK_TAGS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'img',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'pre',
  's',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
]);

const DROP_WITH_CONTENT_TAGS = new Set([
  'applet',
  'base',
  'embed',
  'iframe',
  'link',
  'math',
  'meta',
  'noscript',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['dir', 'lang', 'title']);

const TAG_ALLOWED_ATTRIBUTES = Object.freeze({
  a: new Set(['href', 'rel', 'target']),
  col: new Set(['span']),
  del: new Set(['cite', 'datetime']),
  img: new Set(['alt', 'data-image-number', 'height', 'loading', 'src', 'title', 'width']),
  li: new Set(['value']),
  ol: new Set(['reversed', 'start', 'type']),
  td: new Set(['colspan', 'headers', 'rowspan']),
  th: new Set(['abbr', 'colspan', 'headers', 'rowspan', 'scope']),
  time: new Set(['datetime']),
});

const IMAGE_PLACEHOLDER_PATTERN = /^\s*img\d+\s*$/i;
const CLOSING_PUNCTUATION = /^[,.;:!?%\u00bb\u201d)\]}]/u;
const OPENING_PUNCTUATION = /[\u00ab\u201e([{]$/u;
const PRESERVE_WHITESPACE_TAGS = new Set(['pre']);
const MERGEABLE_INLINE_TAGS = new Set(['a', 'code', 'del', 'em', 'mark', 's', 'small', 'strong', 'sub', 'sup', 'u']);

export const FIX_LABELS = Object.freeze({
  anchors: 'Удалены пустые служебные якоря',
  headingStrong: 'Убраны лишние strong внутри заголовков',
  tables: 'Нормализована структура таблиц',
  cells: 'Упрощены ячейки таблиц',
  serviceLinks: 'Очищены служебные ссылки',
  emptyParagraphs: 'Удалены пустые абзацы',
  emptySpans: 'Убраны лишние span-обертки',
  attributes: 'Удалены inline-стили, классы и небезопасные атрибуты',
  elements: 'Удалены небезопасные и служебные элементы',
  brokenTags: 'Исправлены разорванные теги',
  wrappers: 'Объединены лишние inline-обертки',
  images: 'Изображения пронумерованы в порядке документа',
  whitespace: 'Нормализованы пробелы и переносы строк',
  listClasses: 'Добавлены классы для списков',
  tableClasses: 'Добавлены классы для таблиц',
  tableWrappers: 'Добавлены обертки для таблиц',
});

export const DEFAULT_HTML_CLEANER_OPTIONS = Object.freeze({
  imageMode: 'comment',
  tableClass: '',
  tableWrapperClass: '',
  ulClass: '',
});

function createCounters() {
  return Object.fromEntries(Object.keys(FIX_LABELS).map((key) => [key, 0]));
}

function createFixList(counters) {
  return Object.entries(FIX_LABELS)
    .filter(([key]) => counters[key] > 0)
    .map(([key, label]) => `${label}: ${counters[key]}`);
}

function normalizeOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    imageMode: source.imageMode === 'keep' || source.preserveImages === true ? 'keep' : 'comment',
    tableClass: normalizeClassValue(source.tableClass),
    tableWrapperClass: normalizeClassValue(source.tableWrapperClass),
    ulClass: normalizeClassValue(source.ulClass),
    domParser: source.domParser,
  };
}

export function normalizeTextValue(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\n\f\r ]+/g, ' ')
    .replace(/ +([,.;:!?%\u00bb\u201d)\]}])/gu, '$1')
    .replace(/([\u00ab\u201e([{]) +/gu, '$1');
}

export function normalizeClassValue(value) {
  const tokens = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const safeTokens = tokens.filter((token) => (
    token.length <= 128 && !/[\u0000-\u001f\u007f"'<>`=]/u.test(token)
  ));
  return [...new Set(safeTokens)].slice(0, 64).join(' ');
}

function compactForSchemeCheck(value) {
  return value.replace(/[\u0000-\u0020\u007f-\u009f]/gu, '');
}

export function isSafeUrl(value, { image = false } = {}) {
  const url = String(value ?? '').trim();
  if (!url) return false;

  const compact = compactForSchemeCheck(url);
  if (image && /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/iu.test(compact)) {
    return true;
  }

  if (image && /^blob:/iu.test(compact)) return true;
  if (/^(?:#|\?|\/|\.\/|\.\.\/)/u.test(compact)) return true;

  const scheme = compact.match(/^([a-z][a-z\d+.-]*):/iu)?.[1]?.toLowerCase();
  if (!scheme) return !compact.startsWith('\\');
  return image
    ? scheme === 'http' || scheme === 'https'
    : scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel';
}

function readTagToken(source, start) {
  if (source.startsWith('<!--', start)) {
    const commentEnd = source.indexOf('-->', start + 4);
    const end = commentEnd === -1 ? source.length : commentEnd + 3;
    return { end, raw: source.slice(start, end), type: 'other' };
  }

  let quote = '';
  let cursor = start + 1;
  for (; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') break;
  }

  if (cursor >= source.length) return null;
  const end = cursor + 1;
  const raw = source.slice(start, end);
  const match = raw.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b/iu);
  if (!match) return { end, raw, type: 'other' };

  const tagName = match[2].toLowerCase();
  const closing = Boolean(match[1]);
  return {
    closing,
    end,
    raw,
    selfClosing: !closing && (/\/\s*>$/u.test(raw) || VOID_TAGS.has(tagName)),
    tagName,
    type: 'tag',
  };
}

function tokenizeHtml(source) {
  const tokens = [];
  let cursor = 0;
  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);
    if (tagStart === -1) {
      tokens.push({ raw: source.slice(cursor), type: 'text' });
      break;
    }
    if (tagStart > cursor) tokens.push({ raw: source.slice(cursor, tagStart), type: 'text' });
    const token = readTagToken(source, tagStart);
    if (!token) {
      tokens.push({ raw: source.slice(tagStart), type: 'text' });
      break;
    }
    tokens.push(token);
    cursor = token.end;
  }
  return tokens;
}

function closeInlineTag(stack, tagName) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index] === tagName) {
      stack.splice(index);
      return;
    }
  }
}

/**
 * Repairs a block boundary that was emitted inside an open phrasing element.
 * This pass intentionally does not use regexes over complete tags, so a `>` in
 * a quoted attribute cannot truncate the match.
 */
export function fixBrokenTags(html) {
  const source = String(html ?? '');
  const tokens = tokenizeHtml(source);
  const openInlineTags = [];
  const output = [];
  let fixed = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (
      token.type === 'tag'
      && token.closing
      && REPAIRABLE_BLOCK_TAGS.has(token.tagName)
      && openInlineTags.length > 0
    ) {
      let nextIndex = index + 1;
      while (
        nextIndex < tokens.length
        && tokens[nextIndex].type === 'text'
        && /^\s*$/u.test(tokens[nextIndex].raw)
      ) {
        nextIndex += 1;
      }
      const next = tokens[nextIndex];
      if (next?.type === 'tag' && !next.closing && !next.selfClosing && next.tagName === token.tagName) {
        output.push(' ');
        fixed += 1;
        index = nextIndex;
        continue;
      }
    }

    output.push(token.raw);
    if (token.type !== 'tag' || !INLINE_REPAIR_TAGS.has(token.tagName)) continue;
    if (token.closing) closeInlineTag(openInlineTags, token.tagName);
    else if (!token.selfClosing) openInlineTags.push(token.tagName);
  }

  return { html: output.join(''), fixed };
}

export function parseHtml(html, domParser) {
  const parser = domParser
    || (typeof globalThis.DOMParser === 'function' ? new globalThis.DOMParser() : null);
  if (!parser || typeof parser.parseFromString !== 'function') {
    throw new Error('HTML cleanup requires a browser DOMParser implementation.');
  }
  return parser.parseFromString(String(html ?? ''), 'text/html');
}

function replaceElementWithChildren(element) {
  element.replaceWith(...Array.from(element.childNodes));
}

function renameElement(element, tagName, doc) {
  const replacement = doc.createElement(tagName);
  for (const attribute of Array.from(element.attributes)) {
    replacement.setAttribute(attribute.name, attribute.value);
  }
  replacement.append(...Array.from(element.childNodes));
  element.replaceWith(replacement);
  return replacement;
}

function isServiceLink(href) {
  if (!href) return false;
  try {
    const parsed = new URL(href, 'https://lotus-docs.invalid/');
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'skr.sh'
      || hostname.endsWith('.skr.sh')
      || /screenshot/iu.test(parsed.href)
      || ((hostname === 'docs.google.com' || hostname.endsWith('.docs.google.com'))
        && /^\/document\/d\//iu.test(parsed.pathname));
  } catch {
    return /skr\.sh|screenshot|docs\.google\.com\/document\/d\//iu.test(href);
  }
}

function isAllowedGeneratedClass(element, classValue, options) {
  if (element.tagName === 'UL') return classValue === options.ulClass && Boolean(options.ulClass);
  if (element.tagName === 'TABLE') return classValue === options.tableClass && Boolean(options.tableClass);
  if (element.tagName === 'DIV') return classValue === options.tableWrapperClass && Boolean(options.tableWrapperClass);
  return false;
}

function sanitizeRel(value) {
  const allowed = new Set(['nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc']);
  return [...new Set(String(value).toLowerCase().split(/\s+/).filter((token) => allowed.has(token)))].join(' ');
}

function sanitizeAttributeValue(element, name, value) {
  const tagName = element.tagName.toLowerCase();
  const trimmed = value.trim();

  if (name === 'href' || name === 'cite') return isSafeUrl(trimmed) ? trimmed : null;
  if (name === 'src') return isSafeUrl(trimmed, { image: tagName === 'img' }) ? trimmed : null;
  if (name === 'target') return trimmed === '_blank' || trimmed === '_self' ? trimmed : null;
  if (name === 'rel') return sanitizeRel(trimmed) || null;
  if (name === 'dir') return /^(?:ltr|rtl|auto)$/iu.test(trimmed) ? trimmed.toLowerCase() : null;
  if (name === 'lang') return /^[a-z]{1,8}(?:-[a-z\d]{1,8})*$/iu.test(trimmed) ? trimmed : null;
  if (name === 'loading') return /^(?:eager|lazy)$/iu.test(trimmed) ? trimmed.toLowerCase() : null;
  if (name === 'scope') return /^(?:col|colgroup|row|rowgroup)$/iu.test(trimmed) ? trimmed.toLowerCase() : null;
  if (name === 'type' && tagName === 'ol') return /^(?:1|a|A|i|I)$/u.test(trimmed) ? trimmed : null;
  if (name === 'reversed') return '';
  if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan' || name === 'span') {
    return /^\d{1,5}$/u.test(trimmed) && Number(trimmed) > 0 ? String(Number(trimmed)) : null;
  }
  if (name === 'start' || name === 'value') return /^-?\d{1,9}$/u.test(trimmed) ? String(Number(trimmed)) : null;
  if (name === 'data-image-number') return /^\d{1,6}$/u.test(trimmed) ? String(Number(trimmed)) : null;
  if (name === 'headers') return /^[A-Za-z][\w:.-]*(?:\s+[A-Za-z][\w:.-]*)*$/u.test(trimmed) ? trimmed : null;
  if (name === 'datetime') return trimmed.length <= 128 && !/[<>]/u.test(trimmed) ? trimmed : null;
  return value;
}

function sanitizeAttributes(element, options) {
  let removed = 0;
  const tagName = element.tagName.toLowerCase();
  const tagAttributes = TAG_ALLOWED_ATTRIBUTES[tagName] || new Set();

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (name === 'class') {
      const normalized = normalizeClassValue(value);
      if (isAllowedGeneratedClass(element, normalized, options)) {
        if (normalized !== value) element.setAttribute('class', normalized);
      } else {
        element.removeAttribute(attribute.name);
        removed += 1;
      }
      continue;
    }

    if (name.startsWith('on') || (!GLOBAL_ALLOWED_ATTRIBUTES.has(name) && !tagAttributes.has(name))) {
      element.removeAttribute(attribute.name);
      removed += 1;
      continue;
    }

    const sanitized = sanitizeAttributeValue(element, name, value);
    if (sanitized === null) {
      element.removeAttribute(attribute.name);
      removed += 1;
    } else if (sanitized !== value) {
      element.setAttribute(name, sanitized);
    }
  }

  if (tagName === 'a' && element.getAttribute('target') === '_blank') {
    const rel = new Set((element.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    element.setAttribute('rel', [...rel].join(' '));
  }

  return removed;
}

function sanitizeElements(doc, options, counters) {
  const elements = Array.from(doc.body.querySelectorAll('*'));
  for (const element of elements) {
    if (!element.parentNode || !doc.body.contains(element)) continue;
    const tagName = element.tagName.toLowerCase();
    if (DROP_WITH_CONTENT_TAGS.has(tagName)) {
      element.remove();
      counters.elements += 1;
      continue;
    }
    if (!ALLOWED_TAGS.has(tagName)) {
      replaceElementWithChildren(element);
      counters.elements += 1;
    }
  }

  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    counters.attributes += sanitizeAttributes(element, options);
  }

  for (const image of Array.from(doc.body.querySelectorAll('img:not([src])'))) {
    const alt = image.getAttribute('alt') || '';
    image.replaceWith(doc.createTextNode(alt));
    counters.elements += 1;
  }
}

function prepareImages(doc, imageMode) {
  const images = Array.from(doc.querySelectorAll('img'));
  images.forEach((image, index) => {
    const number = index + 1;
    image.setAttribute('alt', image.getAttribute('alt')?.trim() || `Изображение ${number}`);
    image.setAttribute('data-image-number', String(number));
    if (imageMode === 'comment') image.replaceWith(doc.createComment(` img${number} `));
  });

  for (const figure of Array.from(doc.querySelectorAll('figure'))) replaceElementWithChildren(figure);
  return images.length;
}

function directChildren(element, tagName) {
  const upperTagName = tagName.toUpperCase();
  return Array.from(element.children).filter((child) => child.tagName === upperTagName);
}

function normalizeTable(table, doc) {
  let changed = false;
  const directRows = directChildren(table, 'tr');
  if (directRows.length > 0) {
    let tbody = directChildren(table, 'tbody')[0];
    if (!tbody) {
      tbody = doc.createElement('tbody');
      table.appendChild(tbody);
    }
    directRows.forEach((row) => tbody.appendChild(row));
    changed = true;
  }

  const headSections = directChildren(table, 'thead');
  if (headSections.length > 1) {
    const firstHead = headSections[0];
    headSections.slice(1).forEach((section) => {
      directChildren(section, 'tr').forEach((row) => firstHead.appendChild(row));
      section.remove();
    });
    changed = true;
  }

  const thead = directChildren(table, 'thead')[0];
  const headingRows = thead ? directChildren(thead, 'tr') : [];
  if (headingRows.length > 1) {
    let tbody = directChildren(table, 'tbody')[0];
    if (!tbody) {
      tbody = doc.createElement('tbody');
      if (thead.nextSibling) thead.parentNode.insertBefore(tbody, thead.nextSibling);
      else table.appendChild(tbody);
    }
    const firstBodyRow = directChildren(tbody, 'tr')[0] || null;
    headingRows.slice(1).forEach((row) => {
      directChildren(row, 'th').forEach((th) => renameElement(th, 'td', doc));
      tbody.insertBefore(row, firstBodyRow);
    });
    changed = true;
  }

  for (const section of Array.from(table.children).filter((child) => (
    child.tagName === 'THEAD' || child.tagName === 'TBODY' || child.tagName === 'TFOOT'
  ))) {
    if (directChildren(section, 'tr').length === 0) {
      section.remove();
      changed = true;
    }
  }

  return changed ? 1 : 0;
}

function simplifyTableCells(doc) {
  let fixed = 0;
  for (const cell of Array.from(doc.querySelectorAll('td, th'))) {
    const meaningfulNodes = Array.from(cell.childNodes).filter((node) => (
      node.nodeType !== TEXT_NODE || Boolean(node.nodeValue?.trim())
    ));
    if (meaningfulNodes.length === 1 && meaningfulNodes[0].nodeType === ELEMENT_NODE && meaningfulNodes[0].tagName === 'P') {
      const paragraph = meaningfulNodes[0];
      paragraph.replaceWith(...Array.from(paragraph.childNodes));
      fixed += 1;
    }
  }
  return fixed;
}

function attributeSignature(element) {
  return Array.from(element.attributes)
    .map((attribute) => [attribute.name.toLowerCase(), attribute.value])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}\u0000${value}`)
    .join('\u0001');
}

function equivalentInlineElements(left, right) {
  return right?.nodeType === ELEMENT_NODE
    && left.tagName === right.tagName
    && attributeSignature(left) === attributeSignature(right);
}

function normalizeInlineWrappers(doc, counters) {
  for (const bold of Array.from(doc.querySelectorAll('b'))) {
    if (bold.parentNode) {
      renameElement(bold, 'strong', doc);
      counters.wrappers += 1;
    }
  }
  for (const italic of Array.from(doc.querySelectorAll('i'))) {
    if (italic.parentNode) {
      renameElement(italic, 'em', doc);
      counters.wrappers += 1;
    }
  }

  for (const heading of Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    for (const strong of Array.from(heading.querySelectorAll('strong'))) {
      if (!strong.parentNode) continue;
      replaceElementWithChildren(strong);
      counters.headingStrong += 1;
    }
  }

  for (const span of Array.from(doc.querySelectorAll('span'))) {
    if (!span.parentNode || span.attributes.length > 0) continue;
    replaceElementWithChildren(span);
    counters.emptySpans += 1;
  }

  for (const element of Array.from(doc.querySelectorAll([...MERGEABLE_INLINE_TAGS].join(',')))) {
    if (!element.parentNode) continue;
    const tagName = element.tagName.toLowerCase();
    const sameAncestor = element.parentElement?.closest(tagName);
    if (sameAncestor) {
      replaceElementWithChildren(element);
      counters.wrappers += 1;
    }
  }

  for (const element of Array.from(doc.querySelectorAll([...MERGEABLE_INLINE_TAGS].join(',')))) {
    if (!element.parentNode) continue;
    let separator = element.nextSibling;
    let candidate = separator;
    if (separator?.nodeType === TEXT_NODE && /^\s*$/u.test(separator.nodeValue || '')) {
      candidate = separator.nextSibling;
    } else {
      separator = null;
    }

    while (equivalentInlineElements(element, candidate)) {
      if (separator) element.appendChild(separator);
      element.append(...Array.from(candidate.childNodes));
      candidate.remove();
      counters.wrappers += 1;

      separator = element.nextSibling;
      candidate = separator;
      if (separator?.nodeType === TEXT_NODE && /^\s*$/u.test(separator.nodeValue || '')) {
        candidate = separator.nextSibling;
      } else {
        separator = null;
      }
    }
  }

  for (const element of Array.from(doc.querySelectorAll('a, strong, em, code, del, s, u, mark, small, sub, sup'))) {
    if (!element.parentNode) continue;
    if (element.tagName === 'A' && element.hasAttribute('href') && element.textContent.trim()) continue;
    if (element.textContent.trim() || element.querySelector('img, br')) continue;
    if (element.childNodes.length > 0) replaceElementWithChildren(element);
    else element.remove();
    counters.wrappers += 1;
  }

  for (const anchor of Array.from(doc.querySelectorAll('a:not([href])'))) {
    if (!anchor.parentNode) continue;
    replaceElementWithChildren(anchor);
    counters.anchors += 1;
  }
}

function collectTextRuns(root) {
  const runs = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) runs.push(current);
    current = [];
  };

  const visit = (parent) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === TEXT_NODE) {
        current.push(node);
        continue;
      }
      if (node.nodeType !== ELEMENT_NODE) continue;
      const tagName = node.tagName.toLowerCase();
      if (BLOCK_TAGS.has(tagName) || VOID_TAGS.has(tagName) || PRESERVE_WHITESPACE_TAGS.has(tagName)) {
        flush();
        continue;
      }
      visit(node);
    }
  };

  visit(root);
  flush();
  return runs;
}

function normalizeWhitespace(doc) {
  const changedNodes = new Set();
  const setText = (node, value) => {
    if (node.nodeValue !== value) {
      node.nodeValue = value;
      changedNodes.add(node);
    }
  };

  const allTextNodes = [];
  const walker = doc.createTreeWalker(doc.body, 4);
  while (walker.nextNode()) allTextNodes.push(walker.currentNode);
  for (const node of allTextNodes) {
    if (node.parentElement?.closest('pre, code')) continue;
    setText(node, normalizeTextValue(node.nodeValue || ''));
  }

  const flowRoots = [doc.body, ...Array.from(doc.body.querySelectorAll([...BLOCK_TAGS].join(',')))];
  for (const root of flowRoots) {
    if (root !== doc.body && PRESERVE_WHITESPACE_TAGS.has(root.tagName.toLowerCase())) continue;
    for (const run of collectTextRuns(root)) {
      if (run.length === 0) continue;
      setText(run[0], (run[0].nodeValue || '').replace(/^ +/u, ''));
      setText(run[run.length - 1], (run[run.length - 1].nodeValue || '').replace(/ +$/u, ''));

      for (let index = 0; index < run.length - 1; index += 1) {
        const left = run[index];
        const right = run[index + 1];
        let leftValue = left.nodeValue || '';
        let rightValue = right.nodeValue || '';
        const leftCore = leftValue.replace(/ +$/u, '');
        const rightCore = rightValue.replace(/^ +/u, '');

        if (CLOSING_PUNCTUATION.test(rightCore) || OPENING_PUNCTUATION.test(leftCore)) {
          leftValue = leftCore;
          rightValue = rightCore;
        } else if (/ $/u.test(leftValue) && /^ /u.test(rightValue)) {
          rightValue = rightValue.replace(/^ +/u, '');
        }

        setText(left, leftValue);
        setText(right, rightValue);
      }
    }
  }

  return changedNodes.size;
}

function hasMeaningfulParagraphContent(paragraph) {
  if (paragraph.textContent.trim()) return true;
  if (paragraph.querySelector('br, hr, img')) return true;
  return Array.from(paragraph.childNodes).some((node) => (
    node.nodeType === COMMENT_NODE && IMAGE_PLACEHOLDER_PATTERN.test(node.nodeValue || '')
  ));
}

function removeEmptyParagraphs(doc) {
  let removed = 0;
  for (const paragraph of Array.from(doc.querySelectorAll('p'))) {
    if (!hasMeaningfulParagraphContent(paragraph)) {
      paragraph.remove();
      removed += 1;
    }
  }
  return removed;
}

function applyCustomOutputOptions(doc, options) {
  const counters = { listClasses: 0, tableClasses: 0, tableWrappers: 0 };

  if (options.ulClass) {
    for (const list of Array.from(doc.querySelectorAll('ul'))) {
      if (list.getAttribute('class') !== options.ulClass) {
        list.setAttribute('class', options.ulClass);
        counters.listClasses += 1;
      }
    }
  }

  if (options.tableClass) {
    for (const table of Array.from(doc.querySelectorAll('table'))) {
      if (table.getAttribute('class') !== options.tableClass) {
        table.setAttribute('class', options.tableClass);
        counters.tableClasses += 1;
      }
    }
  }

  if (options.tableWrapperClass) {
    for (const table of Array.from(doc.querySelectorAll('table'))) {
      const parent = table.parentElement;
      const alreadyWrapped = parent?.tagName === 'DIV'
        && parent.getAttribute('class') === options.tableWrapperClass
        && parent.children.length === 1;
      if (alreadyWrapped) continue;

      const wrapper = doc.createElement('div');
      wrapper.setAttribute('class', options.tableWrapperClass);
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
      counters.tableWrappers += 1;
    }
  }

  return counters;
}

function escapeHtmlText(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function escapeHtmlAttribute(value) {
  return escapeHtmlText(value).replace(/"/gu, '&quot;');
}

function openingTag(element) {
  const tagName = element.tagName.toLowerCase();
  const attributes = Array.from(element.attributes).map((attribute) => (
    attribute.value === '' && attribute.name.toLowerCase() === 'reversed'
      ? ` ${attribute.name.toLowerCase()}`
      : ` ${attribute.name.toLowerCase()}="${escapeHtmlAttribute(attribute.value)}"`
  )).join('');
  return `<${tagName}${attributes}>`;
}

function serializeComment(node) {
  let value = String(node.nodeValue || '').replace(/--/gu, '- -');
  if (value.endsWith('-')) value += ' ';
  return `<!--${value}-->`;
}

function serializeCompact(node) {
  if (node.nodeType === TEXT_NODE) return escapeHtmlText(node.nodeValue || '');
  if (node.nodeType === COMMENT_NODE) return serializeComment(node);
  if (node.nodeType !== ELEMENT_NODE) return '';
  const tagName = node.tagName.toLowerCase();
  const open = openingTag(node);
  if (VOID_TAGS.has(tagName)) return open;
  const content = Array.from(node.childNodes).map(serializeCompact).join('');
  return `${open}${content}</${tagName}>`;
}

function renderFormattedNode(node, depth, indent) {
  const padding = indent.repeat(depth);
  if (node.nodeType === TEXT_NODE) return [`${padding}${escapeHtmlText(node.nodeValue || '')}`];
  if (node.nodeType === COMMENT_NODE) return [`${padding}${serializeComment(node)}`];
  if (node.nodeType !== ELEMENT_NODE) return [];

  const tagName = node.tagName.toLowerCase();
  if (VOID_TAGS.has(tagName) || PRESERVE_WHITESPACE_TAGS.has(tagName)) {
    return [`${padding}${serializeCompact(node)}`];
  }

  const children = Array.from(node.childNodes);
  const blockChildren = children.filter((child) => (
    child.nodeType === ELEMENT_NODE && BLOCK_TAGS.has(child.tagName.toLowerCase())
  ));
  const meaningfulInlineChildren = children.filter((child) => (
    child.nodeType === COMMENT_NODE
    || (child.nodeType === TEXT_NODE && Boolean(child.nodeValue))
    || (child.nodeType === ELEMENT_NODE && !BLOCK_TAGS.has(child.tagName.toLowerCase()))
  ));

  if (blockChildren.length === 0 || meaningfulInlineChildren.length > 0) {
    return [`${padding}${serializeCompact(node)}`];
  }

  const lines = [`${padding}${openingTag(node)}`];
  for (const child of children) {
    if (child.nodeType === TEXT_NODE && !child.nodeValue?.trim()) continue;
    lines.push(...renderFormattedNode(child, depth + 1, indent));
  }
  lines.push(`${padding}</${tagName}>`);
  return lines;
}

function formatDocumentBody(doc, indent) {
  const sections = [];
  let inlineBuffer = '';
  const flushInline = () => {
    if (inlineBuffer) sections.push(inlineBuffer);
    inlineBuffer = '';
  };

  for (const node of Array.from(doc.body.childNodes)) {
    const isBlock = node.nodeType === ELEMENT_NODE && BLOCK_TAGS.has(node.tagName.toLowerCase());
    if (!isBlock) {
      inlineBuffer += serializeCompact(node);
      continue;
    }
    flushInline();
    sections.push(renderFormattedNode(node, 0, indent).join('\n'));
  }
  flushInline();
  return sections.filter(Boolean).join('\n\n').replace(/\n{3,}/gu, '\n\n').trim();
}

/** Pretty-prints HTML without trimming or inventing whitespace around inline tags. */
export function formatHtml(html, options = {}) {
  const doc = parseHtml(html, options?.domParser);
  const indent = typeof options?.indent === 'string' && options.indent.length <= 8 ? options.indent : '  ';
  return formatDocumentBody(doc, indent);
}

/**
 * Sanitizes and normalizes HTML produced by Mammoth/Google Docs.
 * The return shape intentionally stays compatible with the original app.
 */
export function cleanDocumentHtml(html, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const repaired = fixBrokenTags(html);
  const doc = parseHtml(repaired.html, normalizedOptions.domParser);
  const counters = createCounters();
  counters.brokenTags = repaired.fixed;

  for (const anchor of Array.from(doc.querySelectorAll('a[id^="_"]'))) {
    if (!anchor.textContent.trim() && !anchor.querySelector('img')) {
      anchor.remove();
      counters.anchors += 1;
    }
  }

  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    if (!isServiceLink(anchor.getAttribute('href') || '')) continue;
    replaceElementWithChildren(anchor);
    counters.serviceLinks += 1;
  }

  counters.images = prepareImages(doc, normalizedOptions.imageMode);
  sanitizeElements(doc, normalizedOptions, counters);
  normalizeInlineWrappers(doc, counters);

  for (const table of Array.from(doc.querySelectorAll('table'))) {
    counters.tables += normalizeTable(table, doc);
  }
  counters.cells = simplifyTableCells(doc);
  counters.whitespace = normalizeWhitespace(doc);
  counters.emptyParagraphs = removeEmptyParagraphs(doc);

  const customCounters = applyCustomOutputOptions(doc, normalizedOptions);
  Object.assign(counters, customCounters);

  return {
    html: formatDocumentBody(doc, '  '),
    fixes: createFixList(counters),
  };
}

export function htmlToPlainText(html, options = {}) {
  const doc = parseHtml(html, options?.domParser);

  for (const image of Array.from(doc.querySelectorAll('img'))) {
    image.replaceWith(doc.createTextNode(image.getAttribute('alt') || ''));
  }
  for (const br of Array.from(doc.querySelectorAll('br'))) br.replaceWith(doc.createTextNode('\n'));
  for (const row of Array.from(doc.querySelectorAll('tr'))) {
    const cells = Array.from(row.children).filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH');
    cells.forEach((cell, index) => {
      if (index < cells.length - 1) cell.appendChild(doc.createTextNode('\t'));
    });
  }
  for (const element of Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr, blockquote'))) {
    element.appendChild(doc.createTextNode('\n'));
  }

  return (doc.body.textContent || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00a0/gu, ' ').replace(/ {2,}/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function escapeMarkdownText(value) {
  return String(value).replace(/([\\`*_[\]<>])/gu, '\\$1');
}

function withBoundaryWhitespace(content, wrap) {
  const match = content.match(/^(\s*)([\s\S]*?)(\s*)$/u);
  if (!match || !match[2]) return content;
  return `${match[1]}${wrap(match[2])}${match[3]}`;
}

function markdownCode(value) {
  const content = String(value);
  const longestRun = Math.max(0, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = '`'.repeat(longestRun + 1);
  const padding = /^`|`$/u.test(content) ? ' ' : '';
  return `${fence}${padding}${content}${padding}${fence}`;
}

function renderMarkdownInline(node) {
  if (node.nodeType === TEXT_NODE) return escapeMarkdownText(normalizeTextValue(node.nodeValue || ''));
  if (node.nodeType === COMMENT_NODE) {
    return IMAGE_PLACEHOLDER_PATTERN.test(node.nodeValue || '') ? serializeComment(node) : '';
  }
  if (node.nodeType !== ELEMENT_NODE) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '  \n';
  if (tagName === 'img') {
    const alt = (node.getAttribute('alt') || '').replace(/\]/gu, '\\]');
    const src = node.getAttribute('src') || '';
    return isSafeUrl(src, { image: true }) ? `![${alt}](${src.replace(/\)/gu, '\\)')})` : alt;
  }
  if (tagName === 'code') return withBoundaryWhitespace(node.textContent || '', markdownCode);

  const content = Array.from(node.childNodes).map(renderMarkdownInline).join('');
  if (tagName === 'strong' || tagName === 'b') return withBoundaryWhitespace(content, (value) => `**${value}**`);
  if (tagName === 'em' || tagName === 'i') return withBoundaryWhitespace(content, (value) => `*${value}*`);
  if (tagName === 's' || tagName === 'del') return withBoundaryWhitespace(content, (value) => `~~${value}~~`);
  if (tagName === 'a') {
    const href = node.getAttribute('href') || '';
    if (!isSafeUrl(href)) return content;
    return withBoundaryWhitespace(content, (value) => `[${value}](${href.replace(/([\\)])/gu, '\\$1')})`);
  }
  return content;
}

function tableToMarkdown(table) {
  const rowElements = Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
  const rows = rowElements.map((row) => Array.from(row.children)
    .filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH')
    .map((cell) => Array.from(cell.childNodes).map(renderMarkdownInline).join('')
      .trim()
      .replace(/\|/gu, '\\|')
      .replace(/\n/gu, '<br>')));
  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  if (width === 0) return '';
  const normalizeRow = (row) => Array.from({ length: width }, (_, index) => row[index] || '');
  const [head, ...body] = rows.map(normalizeRow);
  const separator = Array.from({ length: width }, () => '---');
  return [head, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function renderMarkdownList(list, depth = 0) {
  const ordered = list.tagName === 'OL';
  const start = ordered ? Number(list.getAttribute('start') || 1) : 1;
  return directChildren(list, 'li').map((item, index) => {
    const nestedLists = Array.from(item.children).filter((child) => child.tagName === 'UL' || child.tagName === 'OL');
    const contentNodes = Array.from(item.childNodes).filter((child) => !nestedLists.includes(child));
    const content = contentNodes.map((child) => (
      child.nodeType === ELEMENT_NODE && BLOCK_TAGS.has(child.tagName.toLowerCase())
        ? renderMarkdownBlock(child, depth + 1)
        : renderMarkdownInline(child)
    )).join('').trim();
    const marker = ordered ? `${start + index}.` : '-';
    const line = `${'  '.repeat(depth)}${marker} ${content}`.trimEnd();
    const nested = nestedLists.map((child) => renderMarkdownList(child, depth + 1)).filter(Boolean).join('\n');
    return nested ? `${line}\n${nested}` : line;
  }).join('\n');
}

function renderMarkdownBlock(node, listDepth = 0) {
  if (node.nodeType === TEXT_NODE) return escapeMarkdownText(normalizeTextValue(node.nodeValue || '')).trim();
  if (node.nodeType === COMMENT_NODE) {
    return IMAGE_PLACEHOLDER_PATTERN.test(node.nodeValue || '') ? serializeComment(node) : '';
  }
  if (node.nodeType !== ELEMENT_NODE) return '';

  const tagName = node.tagName.toLowerCase();
  const inlineContent = () => Array.from(node.childNodes).map(renderMarkdownInline).join('').trim();
  if (/^h[1-6]$/u.test(tagName)) return `${'#'.repeat(Number(tagName[1]))} ${inlineContent()}`;
  if (tagName === 'p' || tagName === 'figcaption' || tagName === 'caption') return inlineContent();
  if (tagName === 'ul' || tagName === 'ol') return renderMarkdownList(node, listDepth);
  if (tagName === 'table') return tableToMarkdown(node);
  if (tagName === 'hr') return '---';
  if (tagName === 'pre') {
    const content = node.textContent || '';
    const longestRun = Math.max(2, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
    const fence = '`'.repeat(longestRun + 1);
    return `${fence}\n${content.replace(/\n$/u, '')}\n${fence}`;
  }
  if (tagName === 'blockquote') {
    const content = Array.from(node.childNodes).map((child) => renderMarkdownBlock(child, listDepth)).filter(Boolean).join('\n\n');
    return content.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n');
  }
  if (tagName === 'li') return inlineContent();

  const hasBlockChild = Array.from(node.children).some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()));
  if (!hasBlockChild) return inlineContent();
  return Array.from(node.childNodes).map((child) => renderMarkdownBlock(child, listDepth)).filter(Boolean).join('\n\n');
}

export function htmlToMarkdown(html, options = {}) {
  const doc = parseHtml(html, options?.domParser);
  const sections = [];
  let inlineBuffer = '';
  const flushInline = () => {
    const content = inlineBuffer.trim();
    if (content) sections.push(content);
    inlineBuffer = '';
  };

  for (const node of Array.from(doc.body.childNodes)) {
    const isBlock = node.nodeType === ELEMENT_NODE && BLOCK_TAGS.has(node.tagName.toLowerCase());
    if (!isBlock) {
      inlineBuffer += renderMarkdownInline(node);
      continue;
    }
    flushInline();
    const content = renderMarkdownBlock(node);
    if (content) sections.push(content);
  }
  flushInline();

  return sections.join('\n\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
