import { useId, useMemo, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { downloadBlob } from '../../utils/browserFiles';
import { cx, formatBytes, formatPercent, readableError } from '../../utils/presentation';
import { downloadArticlePackage, downloadImagesZip, imageManifest } from './articleProcessing';

function getHtmlStats(html, images) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [
    { label: 'Заголовков', value: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length },
    { label: 'Таблиц', value: doc.querySelectorAll('table').length },
    { label: 'Ссылок', value: doc.querySelectorAll('a').length },
    { label: 'Списков', value: doc.querySelectorAll('ul, ol').length },
    { label: 'Изображений', value: images.length },
  ];
}

function Stats({ html, images }) {
  const stats = useMemo(() => getHtmlStats(html, images), [html, images]);
  if (!stats.length) return null;
  return (
    <section className="stats" aria-label="Статистика документа">
      {stats.map((item) => (
        <article className="stats__item" key={item.label}>
          <strong>{item.value.toLocaleString('ru-RU')}</strong>
          <span>{item.label}</span>
        </article>
      ))}
    </section>
  );
}

export function ResultPanel({ state, baseName, onCopy, onDownload, onTabChange }) {
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState('idle');
  const [downloadError, setDownloadError] = useState('');
  const id = useId();
  if (state.status !== 'converted') return null;
  if (!state.cleanedHtml) {
    return (
      <EmptyState
        title="В документе нет содержимого"
        text="DOCX обработан успешно, но после очистки в нём не осталось текста, таблиц или изображений."
      />
    );
  }

  const tabs = [
    { id: 'html', label: 'HTML', content: state.cleanedHtml },
    { id: 'markdown', label: 'Markdown', content: state.markdown },
    { id: 'text', label: 'Текст', content: state.plainText },
    { id: 'manifest', label: 'Manifest', content: JSON.stringify(imageManifest(state.images), null, 2) },
  ];
  const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.id === state.activeTab));
  const current = tabs[currentIndex];
  const activateRelativeTab = (offset) => {
    const next = tabs[(currentIndex + offset + tabs.length) % tabs.length];
    onTabChange(next.id);
    window.requestAnimationFrame(() => document.getElementById(id + '-tab-' + next.id)?.focus());
  };
  const downloadPackage = async () => {
    setDownloadStatus('downloading');
    setDownloadError('');
    try {
      await downloadArticlePackage(state.cleanedHtml, state.images, baseName);
    } catch (error) {
      setDownloadError(readableError(error, 'Не удалось собрать архив.'));
    } finally {
      setDownloadStatus('idle');
    }
  };

  return (
    <section className="result" aria-label="Результат конвертации">
      <div className="result__top">
        <div className="tabs" role="tablist" aria-label="Форматы результата">
          {tabs.map((tab) => (
            <button
              className={cx('tabs__button', state.activeTab === tab.id && 'tabs__button--active')}
              id={id + '-tab-' + tab.id}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={state.activeTab === tab.id}
              aria-controls={id + '-panel'}
              tabIndex={state.activeTab === tab.id ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  activateRelativeTab(1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  activateRelativeTab(-1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  onTabChange(tabs[0].id);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  onTabChange(tabs[tabs.length - 1].id);
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="button button--secondary" type="button" onClick={() => onCopy(current.content)}>
            {state.copyStatus === 'copied' ? 'Скопировано' : 'Копировать ' + current.label}
          </button>
          <button className="button button--secondary" type="button" onClick={() => onDownload(current.id, current.content)}>
            Скачать {current.label}
          </button>
          <button className="button" type="button" disabled={downloadStatus === 'downloading'} onClick={downloadPackage}>
            {downloadStatus === 'downloading' ? <><span className="spinner spinner--button" aria-hidden="true" />Собираем ZIP</> : 'Скачать всё'}
          </button>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">{state.copyStatus === 'copied' ? 'Результат скопирован' : ''}</span>
      {downloadError && <div className="status-card status-card--error" role="alert">{downloadError}</div>}
      <Stats html={state.cleanedHtml} images={state.images} />
      <div className="result__grid">
        <article className="panel" role="tabpanel" id={id + '-panel'} aria-labelledby={id + '-tab-' + current.id}>
          <header className="panel__header">
            <span>{current.label}</span>
            <span>{current.content.length.toLocaleString('ru-RU')} символов</span>
          </header>
          <div className="panel__body">
            <pre className="code-block">{current.content}</pre>
          </div>
        </article>
        <article className="panel">
          <header className="panel__header panel__header--preview">
            <span>Предпросмотр HTML</span>
            <label className="spell-toggle">
              <input
                type="checkbox"
                checked={spellCheckEnabled}
                onChange={(event) => setSpellCheckEnabled(event.target.checked)}
              />
              Проверка орфографии
            </label>
          </header>
          <div
            className={cx('panel__body', 'panel__body--preview', spellCheckEnabled && 'panel__body--spellcheck')}
            contentEditable={spellCheckEnabled}
            suppressContentEditableWarning
            spellCheck={spellCheckEnabled}
            lang="ru"
            role="document"
            aria-label="Предпросмотр статьи с браузерной проверкой орфографии"
            onBeforeInput={(event) => event.preventDefault()}
            onPaste={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
            dangerouslySetInnerHTML={{ __html: state.cleanedHtml }}
          />
          <p className="panel__note">
            Подчёркивания создаёт словарь вашего браузера только в предпросмотре. HTML-код не изменяется.
          </p>
        </article>
      </div>
      <article className="fixes">
        <h2>Что обработано</h2>
        <ul>
          {state.fixes.length
            ? state.fixes.map((fix) => <li key={fix}>{fix}</li>)
            : <li>Документ уже был достаточно чистым.</li>}
          {state.messages.map((message, index) => (
            <li key={(message.type || 'message') + '-' + index}>{message.message || String(message)}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}

export function ImagesPanel({ images, baseName, converted }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  if (!converted) return null;
  if (!images.length) {
    return (
      <section className="images-panel" aria-label="Изображения документа">
        <EmptyState
          compact
          title="В документе нет изображений"
          text="Архив всё равно будет содержать HTML и пустой manifest."
        />
      </section>
    );
  }
  const originalTotal = images.reduce((sum, image) => sum + (image.size || 0), 0);
  const outputTotal = images.reduce((sum, image) => sum + (image.optimized?.size ?? image.size ?? 0), 0);
  const saved = Math.max(0, originalTotal - outputTotal);
  const savingPercent = originalTotal ? (saved / originalTotal) * 100 : 0;
  const handleZip = async () => {
    setStatus('downloading');
    setError('');
    try {
      await downloadImagesZip(images, baseName);
    } catch (downloadError) {
      setError(readableError(downloadError, 'Не удалось собрать архив изображений.'));
    } finally {
      setStatus('idle');
    }
  };
  return (
    <section className="images-panel" aria-label="Изображения документа">
      <div className="section-head">
        <div>
          <p className="page-head__eyebrow">Медиа</p>
          <h2>Изображения после HTML</h2>
          <p>Названия и порядок совпадают с комментариями &lt;!-- imgN --&gt; в разметке.</p>
        </div>
        <div className="actions">
          <span className="saving">−{formatBytes(saved)} · {formatPercent(savingPercent)}</span>
          <button className="button button--secondary" type="button" disabled={status === 'downloading'} onClick={handleZip}>
            {status === 'downloading' ? 'Собираем ZIP…' : 'Скачать ZIP'}
          </button>
        </div>
      </div>
      {error && <div className="status-card status-card--error" role="alert">{error}</div>}
      <div className="image-grid">
        {images.map((image, index) => {
          const file = image.optimized || image;
          const source = image.optimized?.dataUrl || image.dataUrl;
          const outputSize = image.optimized?.size ?? image.size;
          const itemSaving = image.size ? Math.max(0, ((image.size - outputSize) / image.size) * 100) : 0;
          return (
            <article className="image-card" key={image.number + '-' + image.name} style={{ '--stagger': index }}>
              <div className="image-card__media">
                <img src={source} alt={'Изображение ' + image.number} loading="lazy" />
              </div>
              <div className="image-card__body">
                <div className="image-card__meta">
                  <span>#{image.number}</span>
                  <span>{file.type || image.contentType}</span>
                </div>
                <strong>{file.name}</strong>
                <span>{formatBytes(image.size)} → {formatBytes(outputSize)} · −{formatPercent(itemSaving)}</span>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => downloadBlob(file.blob, file.name)}
                >
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
