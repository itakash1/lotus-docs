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
          <a className="site-header__link" href="#converter">
            Конвертер
          </a>
          <a className="site-header__link" href="#result">
            Результат
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="hero__eyebrow">DOCX → HTML</p>
      <h1 className="hero__title" id="hero-title">
        Lotus Docs
      </h1>
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

  const acceptFile = (file) => {
    if (file) {
      onFileSelect(file);
    }
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
          acceptFile(event.dataTransfer.files?.[0]);
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
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => acceptFile(event.target.files?.[0])}
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

      {state.error ? (
        <p className="converter__message converter__message--error" role="alert">
          {state.error}
        </p>
      ) : null}
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
  if (!state.cleanedHtml) {
    return null;
  }

  return (
    <section className="result" id="result" aria-label="Результат конвертации">
      <div className="result__actions">
        <button className="button button--secondary" type="button" onClick={onCopy}>
          {state.copyStatus === 'copied' ? 'Скопировано' : 'Копировать HTML'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onDownload}
        >
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
              <li className="fixes__item" key={fix}>
                {fix}
              </li>
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
    if (!file) {
      return;
    }

    dispatch({ type: 'CONVERT_START' });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const normalizedHtml = replaceImagesWithComments(result.value);
      const cleanResult = cleanDocumentHtml(normalizedHtml);

      dispatch({
        type: 'CONVERT_SUCCESS',
        cleanedHtml: cleanResult.html,
        formattedHtml: formatHtml(cleanResult.html),
        fixes: cleanResult.fixes,
      });
    } catch (error) {
      dispatch({
        type: 'CONVERT_ERROR',
        message:
          error instanceof Error
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

    if (!file) {
      return;
    }

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
    if (!state.cleanedHtml) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.cleanedHtml);
      dispatch({ type: 'COPY_SUCCESS' });
      window.setTimeout(() => dispatch({ type: 'COPY_RESET' }), 1800);
    } catch {
      dispatch({
        type: 'CONVERT_ERROR',
        message: 'Браузер не разрешил скопировать HTML в буфер обмена.',
      });
    }
  };

  const downloadHtml = () => {
    if (!state.cleanedHtml) {
      return;
    }

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
          <ResultPanel state={state} onCopy={copyHtml} onDownload={downloadHtml} />
        </div>
      </main>
      <Footer />
    </div>
  );
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

function replaceImagesWithComments(html) {
  const doc = parseHtml(html);

  doc.querySelectorAll('img').forEach((image, index) => {
    image.replaceWith(doc.createComment(` image ${index + 1} `));
  });

  return doc.body.innerHTML;
}

function cleanDocumentHtml(html) {
  const doc = parseHtml(html);
  const counters = {
    anchors: 0,
    headingStrong: 0,
    tables: 0,
    cells: 0,
    serviceLinks: 0,
    emptyParagraphs: 0,
    emptySpans: 0,
    attributes: 0,
  };

  doc.querySelectorAll('a[id^="_"]').forEach((anchor) => {
    if (!anchor.textContent.trim() && anchor.children.length === 0) {
      counters.anchors += 1;
      anchor.remove();
    }
  });

  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    heading.querySelectorAll('strong').forEach((strong) => {
      counters.headingStrong += 1;
      strong.replaceWith(...strong.childNodes);
    });
  });

  doc.querySelectorAll('table').forEach((table) => {
    counters.tables += normalizeTable(table, doc);
  });

  doc.querySelectorAll('td, th').forEach((cell) => {
    const childElements = Array.from(cell.children);
    if (childElements.length === 1 && childElements[0].tagName === 'P') {
      counters.cells += 1;
      childElements[0].replaceWith(...childElements[0].childNodes);
    }
  });

  doc.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (/skr\.sh|screenshot|docs\.google\.com\/document\/d\//i.test(href)) {
      counters.serviceLinks += 1;
      link.replaceWith(...link.childNodes);
    }
  });

  doc.querySelectorAll('span').forEach((span) => {
    if (!span.attributes.length && span.children.length === 0 && !span.textContent.trim()) {
      counters.emptySpans += 1;
      span.remove();
    }
  });

  doc.querySelectorAll('p').forEach((paragraph) => {
    if (!paragraph.textContent.trim() && paragraph.children.length === 0) {
      counters.emptyParagraphs += 1;
      paragraph.remove();
    }
  });

  doc.body.querySelectorAll('*').forEach((element) => {
    counters.attributes += stripUnsafeAndServiceAttributes(element);
  });

  return {
    html: doc.body.innerHTML.trim(),
    fixes: createFixList(counters),
  };
}

function normalizeTable(table, doc) {
  const thead = table.querySelector(':scope > thead');
  const directRows = Array.from(table.children).filter(
    (child) => child.tagName === 'TR',
  );
  let fixed = 0;

  if (directRows.length) {
    const tbody = doc.createElement('tbody');
    directRows.forEach((row) => tbody.appendChild(row));
    table.appendChild(tbody);
    fixed = 1;
  }

  if (!thead) {
    return fixed;
  }

  const rows = Array.from(thead.querySelectorAll(':scope > tr'));
  if (rows.length <= 1) {
    return fixed;
  }

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

function stripUnsafeAndServiceAttributes(element) {
  const allowedAttributes = new Set(['href', 'colspan', 'rowspan']);
  let removed = 0;

  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    const isUnsafeHref =
      name === 'href' && !/^(https?:|mailto:|tel:|#|\/)/i.test(value);

    if (!allowedAttributes.has(name) || name.startsWith('on') || isUnsafeHref) {
      element.removeAttribute(attribute.name);
      removed += 1;
    }
  });

  return removed;
}

function createFixList(counters) {
  const labels = [
    ['anchors', 'Удалены пустые служебные якоря'],
    ['headingStrong', 'Убраны лишние strong внутри заголовков'],
    ['tables', 'Нормализована структура таблиц'],
    ['cells', 'Упрощены ячейки таблиц'],
    ['serviceLinks', 'Очищены служебные ссылки'],
    ['emptyParagraphs', 'Удалены пустые абзацы'],
    ['emptySpans', 'Удалены пустые span-обертки'],
    ['attributes', 'Удалены inline-стили, классы и небезопасные атрибуты'],
  ];

  return labels
    .filter(([key]) => counters[key] > 0)
    .map(([key, label]) => `${label}: ${counters[key]}`);
}

function getHtmlStats(html) {
  const doc = parseHtml(html);
  const imageComments = html.match(/<!--\s*image\s+\d+\s*-->/gi) || [];

  return [
    { label: 'Заголовков', value: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length },
    { label: 'Таблиц', value: doc.querySelectorAll('table').length },
    { label: 'Ссылок', value: doc.querySelectorAll('a').length },
    { label: 'Списков', value: doc.querySelectorAll('ul, ol').length },
    { label: 'Изображений', value: doc.querySelectorAll('img').length + imageComments.length },
  ];
}

function formatHtml(html) {
  return html
    .replace(/></g, '>\n<')
    .replace(/(<\/?(?:h[1-6]|table|thead|tbody|tr|ul|ol|li|p|blockquote))/gi, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

createRoot(document.getElementById('root')).render(<App />);
