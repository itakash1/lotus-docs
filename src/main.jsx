import React, { useMemo, useReducer, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import mammoth from 'mammoth/mammoth.browser';
import './styles.css';

const initialState = {
  selectedFile: null,
  fileName: '',
  cleanedHtml: '',
  formattedHtml: '',
  fixes: [],
  status: 'idle',
  error: '',
  dragActive: false,
  copyStatus: 'idle',
};

const ALLOWED_ATTRIBUTES = new Set(['href', 'colspan', 'rowspan']);
const SERVICE_LINK_PATTERNS = /skr\.sh|screenshot|docs\.google\.com\/document\/d\//i;
const SAFE_HREF_PATTERN = /^(https?:|mailto:|tel:|#|\/)/i;
const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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
  imageComments: 'Изображения заменены на комментарии',
  whitespace: 'Нормализованы пробелы и переносы строк',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_FILE':
      return {
        ...state,
        selectedFile: action.file,
        fileName: action.file.name,
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
        cleanedHtml: action.cleanedHtml,
        formattedHtml: action.formattedHtml,
        fixes: action.fixes,
        error: '',
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
    imageComments: 0,
    whitespace: 0,
  };
}

function normalizeWhitespace(html) {
  let fixed = 0;
  
  html = html.replace(/<p>\s*<\/p>/gi, '');
  html = html.replace(/<(p|h[1-6]|li|td|th|div)>\s+/gi, '<$1>');
  html = html.replace(/\s+<\/(p|h[1-6]|li|td|th|div)>/gi, '</$1>');
  html = html.replace(/>\s+</g, '><');
  html = html.replace(/(<\/[^>]+>)\s+(<[^>]+>)/g, '$1$2');
  html = html.replace(/\n\s*\n\s*\n/g, '\n\n');
  html = html.replace(/^\s+|\s+$/gm, '');
  html = html.replace(/>\s*\n\s*</g, '>\n<');
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.trim();
  
  fixed = 1;
  
  return { html, fixed };
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

function replaceImagesWithComments(html) {
  const doc = parseHtml(html);
  let replaced = 0;
  
  const images = Array.from(doc.querySelectorAll('img'));
  
  images.forEach((image, index) => {
    const comment = doc.createComment(` image ${index + 1} `);
    const parent = image.parentNode;
    
    if (!parent) {
      image.replaceWith(comment);
      replaced++;
      return;
    }
    
    const figureWrapper = parent.closest('figure');
    const targetParent = figureWrapper || parent;
    const grandParent = targetParent.parentNode;
    
    if (!grandParent) {
      image.replaceWith(comment);
      replaced++;
      return;
    }
    
    const textContent = targetParent.textContent.trim();
    const hasOnlyImage = !textContent || targetParent.children.length === 1;
    
    if (hasOnlyImage && targetParent.tagName === 'P') {
      grandParent.insertBefore(comment, targetParent.nextSibling || targetParent);
      targetParent.remove();
      replaced++;
    } else if (hasOnlyImage && targetParent.tagName === 'FIGURE') {
      grandParent.insertBefore(comment, targetParent.nextSibling || targetParent);
      targetParent.remove();
      replaced++;
    } else {
      image.replaceWith(comment);
      replaced++;
    }
  });
  
  return { html: doc.body.innerHTML, count: replaced };
}

function cleanDocumentHtml(html) {
  const { html: fixedHtml, fixed: brokenFixed } = fixBrokenTags(html);
  const { html: htmlWithImages, count: imageCount } = replaceImagesWithComments(fixedHtml);
  
  const doc = parseHtml(htmlWithImages);
  const counters = createCounters();
  counters.brokenTags = brokenFixed;
  counters.imageComments = imageCount;

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
    if (!paragraph.textContent.trim() && !paragraph.children.length) {
      counters.emptyParagraphs++;
      paragraph.remove();
    }
  });

  doc.body.querySelectorAll('*').forEach((element) => {
    counters.attributes += stripUnsafeAttributes(element);
  });

  let resultHtml = doc.body.innerHTML;
  
  resultHtml = resultHtml.replace(/<!--\s*image\s+(\d+)\s*-->/gi, '<!-- image $1 -->');
  
  const { html: normalizedHtml, fixed: whitespaceFixed } = normalizeWhitespace(resultHtml);
  counters.whitespace = whitespaceFixed;

  return {
    html: normalizedHtml,
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

    if (name === 'href' && !SAFE_HREF_PATTERN.test(value)) {
      element.removeAttribute(attribute.name);
      removed++;
      return;
    }

    if (!ALLOWED_ATTRIBUTES.has(name)) {
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
  const imageComments = (html.match(/<!--\s*image\s+\d+\s*-->/gi) || []).length;

  return [
    { label: 'Заголовков', value: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length },
    { label: 'Таблиц', value: doc.querySelectorAll('table').length },
    { label: 'Ссылок', value: doc.querySelectorAll('a').length },
    { label: 'Списков', value: doc.querySelectorAll('ul, ol').length },
    { label: 'Изображений', value: imageComments },
  ];
}

function formatHtml(html) {
  const indent = '  ';
  let formatted = '';
  let indentLevel = 0;
  
  const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const blockElements = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'table', 'thead', 'tbody', 'tr', 
    'ul', 'ol', 'li', 'blockquote', 'div', 'section', 'article', 'header', 'footer'
  ]);
  
  const tokens = html.split(/(<[^>]+>)/g).filter(Boolean);
  
  tokens.forEach((token) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    
    if (token.startsWith('<!--')) {
      formatted += '\n' + indent.repeat(indentLevel) + token + '\n';
      return;
    }
    
    if (token.startsWith('</')) {
      const tagName = token.slice(2, -1).toLowerCase();
      if (blockElements.has(tagName)) {
        indentLevel = Math.max(0, indentLevel - 1);
        formatted += '\n' + indent.repeat(indentLevel) + token + '\n';
      } else {
        formatted += token;
      }
      return;
    }
    
    if (token.startsWith('<')) {
      const match = token.match(/^<(\w+)/);
      if (match) {
        const tagName = match[1].toLowerCase();
        if (blockElements.has(tagName)) {
          formatted += '\n' + indent.repeat(indentLevel) + token;
          if (!selfClosing.has(tagName) && !token.endsWith('/>')) {
            indentLevel++;
          }
          return;
        }
      }
      formatted += token;
      return;
    }
    
    formatted += token;
  });
  
  return formatted
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
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

function UploadZone({ state, onFileSelect, onConvert, fileInputRef }) {
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

  const convertDocument = async (file = state.selectedFile) => {
    if (!file) return;

    dispatch({ type: 'CONVERT_START' });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const cleanResult = cleanDocumentHtml(result.value);

      dispatch({
        type: 'CONVERT_SUCCESS',
        cleanedHtml: cleanResult.html,
        formattedHtml: formatHtml(cleanResult.html),
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
    void convertDocument(file);
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
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onConvert={() => convertDocument()}
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