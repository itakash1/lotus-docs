import React, { useMemo, useReducer, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import mammoth from 'mammoth/mammoth.browser';
import './styles.css';

const initialState = {
  selectedFile: null,
  fileName: '',
  sourceHtml: '',
  cleanedHtml: '',
  formattedHtml: '',
  fixes: [],
  status: 'idle',
  error: '',
  dragActive: false,
  copyStatus: 'idle',
  conversionOptions: {
    ulClass: '',
    tableClass: '',
    wrapTables: false,
    tableWrapperClass: '',
  },
};

const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['colspan', 'rowspan']);
const LINK_ALLOWED_ATTRIBUTES = new Set(['href']);
const IMAGE_ALLOWED_ATTRIBUTES = new Set(['src', 'alt', 'title', 'width', 'height']);
const SERVICE_LINK_PATTERNS = /skr\.sh|screenshot|docs\.google\.com\/document\/d\//i;
const SAFE_HREF_PATTERN = /^(https?:|mailto:|tel:|#|\/)/i;
const SAFE_IMAGE_SRC_PATTERN = /^(data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,|https?:|\/|\.\/|\.\.\/)/i;
const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const IMAGE_PLACEHOLDER_CONVERTER = mammoth.images.imgElement(() => ({ src: '' }));

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
  images: 'Изображения заменены текстовыми метками',
  whitespace: 'Нормализованы пробелы и переносы строк',
  listClasses: 'Добавлены классы для списков',
  tableClasses: 'Добавлены классы для таблиц',
  tableWrappers: 'Добавлены обертки для таблиц',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_FILE':
      return {
        ...state,
        selectedFile: action.file,
        fileName: action.file.name,
        sourceHtml: '',
        cleanedHtml: '',
        formattedHtml: '',
        fixes: [],
        status: 'ready',
        error: '',
        copyStatus: 'idle',
      };
    case 'SET_DRAG_ACTIVE':
      return { ...state, dragActive: action.value };
    case 'CONVERT_START':
      return { ...state, status: 'converting', error: '', copyStatus: 'idle' };
    case 'CONVERT_SUCCESS':
      return {
        ...state,
        status: 'converted',
        sourceHtml: action.sourceHtml,
        cleanedHtml: action.cleanedHtml,
        formattedHtml: action.formattedHtml,
        fixes: action.fixes,
        error: '',
      };
    case 'SET_CONVERSION_OPTIONS':
      return {
        ...state,
        conversionOptions: action.options,
        ...(action.cleanResult
          ? {
              cleanedHtml: action.cleanResult.html,
              formattedHtml: action.cleanResult.html,
              fixes: action.cleanResult.fixes,
            }
          : {}),
        copyStatus: 'idle',
      };
    case 'CONVERT_ERROR':
      return { ...state, status: 'error', error: action.message };
    case 'COPY_SUCCESS':
      return { ...state, copyStatus: 'copied' };
    case 'COPY_RESET':
      return { ...state, copyStatus: 'idle' };
    default:
      return state;
  }
}

function isDocx(file) {
  return /\.docx$/i.test(file.name);
}

function getOutputFileName(fileName) {
  const baseName = fileName.replace(/\.docx$/i, '') || 'document';
  return `${baseName}_lotus.html`;
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function createCounters() {
  return {
    anchors: 0,
    headingStrong: 0,
    tables: 0,
    cells: 0,
    serviceLinks: 0,
    emptyParagraphs: 0,
    emptySpans: 0,
    attributes: 0,
    brokenTags: 0,
    images: 0,
    whitespace: 0,
    listClasses: 0,
    tableClasses: 0,
    tableWrappers: 0,
  };
}

function normalizeTextValue(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/\s+([,.;:!?%])/g, '$1')
    .replace(/([«„])\s+/g, '$1')
    .replace(/\s+([»“])/g, '$1');
}

function normalizeDocumentTextNodes(doc) {
  let fixed = 0;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

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

function isImagePlaceholderText(value) {
  return /^(?:img\d+\s*)+$/i.test(value.trim());
}

function replaceElementWithChildren(element) {
  element.replaceWith(...Array.from(element.childNodes));
}

function replaceImagesWithPlaceholders(doc) {
  const images = Array.from(doc.querySelectorAll('img'));

  images.forEach((image, index) => {
    image.replaceWith(doc.createTextNode(` img${index + 1} `));
  });

  doc.querySelectorAll('figure').forEach((figure) => {
    replaceElementWithChildren(figure);
  });

  doc.querySelectorAll('a, span, strong, em, b, i').forEach((element) => {
    if (isImagePlaceholderText(element.textContent || '')) {
      replaceElementWithChildren(element);
    }
  });

  doc.querySelectorAll('p').forEach((paragraph) => {
    if (isImagePlaceholderText(paragraph.textContent || '')) {
      replaceElementWithChildren(paragraph);
    }
  });

  return images.length;
}

function removeImagePlaceholders(doc) {
  let removed = 0;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments = [];

  while (walker.nextNode()) {
    comments.push(walker.currentNode);
  }

  comments.forEach((comment) => {
    if (!/^\s*image\s+\d+\s*$/i.test(comment.nodeValue || '')) return;

    const parent = comment.parentNode;
    if (parent?.tagName === 'STRONG' && parent.parentNode?.tagName === 'P') {
      parent.parentNode.remove();
      removed++;
      return;
    }

    if (parent?.tagName === 'P') {
      parent.remove();
      removed++;
      return;
    }

    comment.remove();
    removed++;
  });

  return removed;
}

function normalizeClassValue(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function applyCustomOutputOptions(doc, options = {}) {
  const ulClass = normalizeClassValue(options.ulClass || '');
  const tableClass = normalizeClassValue(options.tableClass || '');
  const wrapperClass = normalizeClassValue(options.tableWrapperClass || '');
  const counters = {
    listClasses: 0,
    tableClasses: 0,
    tableWrappers: 0,
  };

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

  if (options.wrapTables) {
    doc.querySelectorAll('table').forEach((table) => {
      const wrapper = doc.createElement('div');

      if (wrapperClass) {
        wrapper.setAttribute('class', wrapperClass);
      }

      table.replaceWith(wrapper);
      wrapper.appendChild(table);
      counters.tableWrappers++;
    });
  }

  return counters;
}

function cleanDocumentHtml(html, options = {}) {
  const { html: fixedHtml, fixed: brokenFixed } = fixBrokenTags(html);
  const doc = parseHtml(fixedHtml);
  const counters = createCounters();
  counters.brokenTags = brokenFixed;
  counters.images = replaceImagesWithPlaceholders(doc);

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

  counters.emptyParagraphs += removeImagePlaceholders(doc);

  doc.body.querySelectorAll('*').forEach((element) => {
    counters.attributes += stripUnsafeAttributes(element);
  });

  const customCounters = applyCustomOutputOptions(doc, options);
  counters.listClasses = customCounters.listClasses;
  counters.tableClasses = customCounters.tableClasses;
  counters.tableWrappers = customCounters.tableWrappers;

  counters.whitespace = normalizeDocumentTextNodes(doc);

  return {
    html: formatHtml(doc.body.innerHTML),
    fixes: createFixList(counters),
  };
}

function normalizeTable(table, doc) {
  const thead = table.querySelector(':scope > thead');
  const directRows = Array.from(table.children).filter(
    (child) => child.tagName === 'TR'
  );
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

function createFixList(counters) {
  return Object.entries(FIX_LABELS)
    .filter(([key]) => counters[key] > 0)
    .map(([key, label]) => `${label}: ${counters[key]}`);
}

function getHtmlStats(html) {
  const doc = parseHtml(html);
  const imagePlaceholders = html.match(/\bimg\d+\b/g) || [];

  return [
    { label: 'Заголовков', value: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length },
    { label: 'Таблиц', value: doc.querySelectorAll('table').length },
    { label: 'Ссылок', value: doc.querySelectorAll('a').length },
    { label: 'Списков', value: doc.querySelectorAll('ul, ol').length },
    { label: 'Изображений', value: imagePlaceholders.length },
  ];
}

function formatHtml(html) {
  const indent = '  ';
  const voidElements = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const blockElements = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'table', 'thead', 'tbody', 'tr',
    'ul', 'ol', 'li', 'blockquote', 'div', 'section', 'article', 'header', 'footer', 'figure'
  ]);
  const doc = parseHtml(html);

  const hasBlockChild = (element) => Array.from(element.children).some((child) => (
    blockElements.has(child.tagName.toLowerCase())
  ));

  const normalizeText = (value) => normalizeTextValue(value).trim();

  const getOpeningTag = (element) => {
    const match = element.outerHTML.match(/^<[^>]+>/);
    return match ? match[0] : `<${element.tagName.toLowerCase()}>`;
  };

  const shouldInsertSpace = (left, right) => {
    if (!left || !right || !left.text || !right.text) return false;

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

    return parts.reduce((html, part) => {
      if (!part.html) return html;

      const separator = shouldInsertSpace(previous, part) ? ' ' : '';
      if (part.text) previous = part;

      return `${html}${separator}${part.html}`;
    }, '').trim();
  };

  const renderInlinePart = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent || '');
      return { html: text, text };
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      return { html: `<!--${node.nodeValue}-->`, text: '' };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return { html: '', text: '' };

    const tagName = node.tagName.toLowerCase();
    if (voidElements.has(tagName)) {
      return { html: node.outerHTML, text: normalizeText(node.textContent || '') };
    }

    if (blockElements.has(tagName) && hasBlockChild(node)) {
      return { html: node.outerHTML, text: normalizeText(node.textContent || '') };
    }

    const innerHtml = joinInlineParts(Array.from(node.childNodes).map(renderInlinePart));
    const html = `${getOpeningTag(node)}${innerHtml}</${tagName}>`;

    return { html, text: normalizeText(node.textContent || '') };
  };

  const renderNode = (node, depth = 0) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent || '');
      return text ? [`${indent.repeat(depth)}${text}`] : [];
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      return [`${indent.repeat(depth)}<!--${node.nodeValue}-->`];
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return [];

    const tagName = node.tagName.toLowerCase();
    if (voidElements.has(tagName)) return [`${indent.repeat(depth)}${node.outerHTML}`];

    const children = Array.from(node.childNodes);
    const shouldStayInline = !hasBlockChild(node)
      && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'figure'].includes(tagName);

    if (shouldStayInline) {
      const innerHtml = joinInlineParts(children.map(renderInlinePart));
      return [`${indent.repeat(depth)}${getOpeningTag(node)}${innerHtml}</${tagName}>`];
    }

    const lines = [`${indent.repeat(depth)}${getOpeningTag(node)}`];
    children.forEach((child) => {
      lines.push(...renderNode(child, depth + 1));
    });
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

function LotusLogo() {
  return (
    <span className="site-header__logo-mark" aria-hidden="true">
      <img className="site-header__logo-image" src="/lotus.svg" alt="" />
    </span>
  );
}

function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-header__brand" href="/" aria-label="Lotus Docs">
          <LotusLogo />
          <span className="site-header__brand-text">Lotus Docs</span>
        </a>
        <nav className="site-header__nav" aria-label="Основная навигация">
          <a className="site-header__link" href="#converter">Конвертер</a>
          <a className="site-header__link" href="#result">Результат</a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="hero__eyebrow">DOCX → HTML</p>
      <h1 className="hero__title" id="hero-title">Lotus Docs</h1>
      <p className="hero__text">
        Конвертер Google Docs и DOCX в чистую HTML-разметку без служебных
        якорей, лишних оберток и табличных артефактов.
      </p>
    </section>
  );
}

function UploadZone({
  state,
  options,
  onFileSelect,
  onConvert,
  onOptionsChange,
  fileInputRef,
}) {
  const uploadClassName = [
    'upload-zone',
    state.dragActive ? 'upload-zone--drag-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleFile = (file) => {
    if (file) onFileSelect(file);
  };

  return (
    <section className="converter" id="converter" aria-label="Загрузка файла">
      <button
        className={uploadClassName}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          onFileSelect(null, true);
        }}
        onDragLeave={() => onFileSelect(null, false)}
        onDrop={(event) => {
          event.preventDefault();
          onFileSelect(null, false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <span className="upload-zone__badge">DOCX</span>
        <span className="upload-zone__title">
          {state.fileName || 'Перетащите файл сюда'}
        </span>
        <span className="upload-zone__hint">
          {state.fileName
            ? 'Файл выбран. Конвертация запускается автоматически.'
            : 'Или нажмите, чтобы выбрать документ'}
        </span>
      </button>

      <input
        className="converter__file-input"
        ref={fileInputRef}
        type="file"
        accept={`.docx,${DOCX_MIME_TYPES.join(',')}`}
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      <div className="converter-settings" aria-label="Настройки HTML">
        <label className="converter-settings__field">
          <span className="converter-settings__label">Класс ul</span>
          <input
            className="converter-settings__input"
            type="text"
            value={options.ulClass}
            placeholder="content-list"
            onChange={(event) => onOptionsChange({ ulClass: event.target.value })}
          />
        </label>

        <label className="converter-settings__field">
          <span className="converter-settings__label">Класс table</span>
          <input
            className="converter-settings__input"
            type="text"
            value={options.tableClass}
            placeholder="content-table"
            onChange={(event) => onOptionsChange({ tableClass: event.target.value })}
          />
        </label>

        <label className="converter-settings__toggle">
          <input
            className="converter-settings__checkbox"
            type="checkbox"
            checked={options.wrapTables}
            onChange={(event) => onOptionsChange({ wrapTables: event.target.checked })}
          />
          <span>Обертка table</span>
        </label>

        <label className="converter-settings__field">
          <span className="converter-settings__label">Класс обертки</span>
          <input
            className="converter-settings__input"
            type="text"
            value={options.tableWrapperClass}
            placeholder="table-container"
            disabled={!options.wrapTables}
            onChange={(event) => onOptionsChange({ tableWrapperClass: event.target.value })}
          />
        </label>
      </div>

      <div className="converter__controls" aria-label="Действия с документом">
        <button
          className="button"
          type="button"
          onClick={onConvert}
          disabled={!state.selectedFile || state.status === 'converting'}
        >
          {state.status === 'converting' ? 'Конвертация...' : 'Конвертировать'}
        </button>
      </div>

      {state.error && (
        <p className="converter__message converter__message--error" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}

function Stats({ html }) {
  const stats = useMemo(() => getHtmlStats(html), [html]);

  return (
    <section className="stats" aria-label="Статистика документа">
      {stats.map((item) => (
        <article className="stats__item" key={item.label}>
          <strong className="stats__value">{item.value}</strong>
          <span className="stats__label">{item.label}</span>
        </article>
      ))}
    </section>
  );
}

function ResultPanel({ state, onCopy, onDownload }) {
  if (!state.cleanedHtml) return null;

  return (
    <section className="result" id="result" aria-label="Результат конвертации">
      <div className="result__actions">
        <button className="button button--secondary" type="button" onClick={onCopy}>
          {state.copyStatus === 'copied' ? 'Скопировано' : 'Копировать HTML'}
        </button>
        <button className="button button--secondary" type="button" onClick={onDownload}>
          Скачать HTML
        </button>
      </div>

      <Stats html={state.cleanedHtml} />

      <div className="result__grid">
        <article className="panel">
          <header className="panel__header">Предпросмотр</header>
          <div
            className="panel__body panel__body--preview"
            dangerouslySetInnerHTML={{ __html: state.cleanedHtml }}
          />
        </article>

        <article className="panel">
          <header className="panel__header">HTML-код</header>
          <div className="panel__body">
            <pre className="code-block">{state.formattedHtml}</pre>
          </div>
        </article>
      </div>

      <article className="fixes">
        <h2 className="fixes__title">Исправления</h2>
        <ul className="fixes__list">
          {state.fixes.length ? (
            state.fixes.map((fix) => (
              <li className="fixes__item" key={fix}>{fix}</li>
            ))
          ) : (
            <li className="fixes__item fixes__item--muted">
              Документ уже был достаточно чистым.
            </li>
          )}
        </ul>
      </article>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <a className="site-footer__brand" href="/">
          <img className="site-footer__logo" src="/lotus.svg" alt="" />
          <span>Lotus Docs</span>
        </a>
        <p className="site-footer__copyright">
          It&apos;s Takashi (Николай Маликов)
        </p>
        <nav className="site-footer__nav" aria-label="Контакты">
          <a
            className="site-footer__link"
            href="https://t.me/itakash1"
            target="_blank"
            rel="noreferrer"
          >
            Telegram
          </a>
          <a
            className="site-footer__link"
            href="https://github.com/itakash1"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const fileInputRef = useRef(null);

  const convertDocument = async (file = state.selectedFile, options = state.conversionOptions) => {
    if (!file) return;

    dispatch({ type: 'CONVERT_START' });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        { convertImage: IMAGE_PLACEHOLDER_CONVERTER }
      );
      const cleanResult = cleanDocumentHtml(result.value, options);

      dispatch({
        type: 'CONVERT_SUCCESS',
        sourceHtml: result.value,
        cleanedHtml: cleanResult.html,
        formattedHtml: cleanResult.html,
        fixes: cleanResult.fixes,
      });
    } catch (error) {
      dispatch({
        type: 'CONVERT_ERROR',
        message: error instanceof Error
          ? `Не удалось конвертировать документ: ${error.message}`
          : 'Не удалось конвертировать документ.',
      });
    }
  };

  const handleFileSelect = (file, dragState) => {
    if (typeof dragState === 'boolean') {
      dispatch({ type: 'SET_DRAG_ACTIVE', value: dragState });
      return;
    }

    if (!file) return;

    if (!isDocx(file)) {
      dispatch({
        type: 'CONVERT_ERROR',
        message: 'Выберите файл в формате .docx.',
      });
      return;
    }

    dispatch({ type: 'SET_FILE', file });
    void convertDocument(file, state.conversionOptions);
  };

  const updateConversionOptions = (patch) => {
    const options = { ...state.conversionOptions, ...patch };
    const cleanResult = state.sourceHtml
      ? cleanDocumentHtml(state.sourceHtml, options)
      : null;

    dispatch({
      type: 'SET_CONVERSION_OPTIONS',
      options,
      cleanResult,
    });
  };

  const copyHtml = async () => {
    if (!state.cleanedHtml) return;

    try {
      await navigator.clipboard.writeText(state.cleanedHtml);
      dispatch({ type: 'COPY_SUCCESS' });
      setTimeout(() => dispatch({ type: 'COPY_RESET' }), 1800);
    } catch {
      dispatch({
        type: 'CONVERT_ERROR',
        message: 'Браузер не разрешил скопировать HTML в буфер обмена.',
      });
    }
  };

  const downloadHtml = () => {
    if (!state.cleanedHtml) return;

    const blob = new Blob([state.cleanedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getOutputFileName(state.fileName);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <div className="app__container">
          <Hero />
          <UploadZone
            state={state}
            options={state.conversionOptions}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onConvert={() => convertDocument(state.selectedFile, state.conversionOptions)}
            onOptionsChange={updateConversionOptions}
          />
          <ResultPanel
            state={state}
            onCopy={copyHtml}
            onDownload={downloadHtml}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
