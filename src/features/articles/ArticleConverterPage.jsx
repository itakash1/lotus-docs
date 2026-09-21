import { useEffect, useRef, useState } from 'react';
import { FileQueue } from '../../components/ui/FileQueue';
import { PageHead } from '../../components/ui/PageHead';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { UploadZone } from '../../components/ui/UploadZone';
import { ARTICLE_INITIAL_STATE } from '../../constants/article';
import { ACCEPT_BY_FORMAT } from '../../constants/formats';
import { downloadText } from '../../utils/browserFiles';
import { copyToClipboard } from '../../utils/clipboard';
import { getBaseName, sanitizeFileName } from '../../utils/fileConverters';
import { getBasicQueueError } from '../../utils/fileQueue';
import { htmlToMarkdown, htmlToPlainText } from '../../utils/htmlCleaner';
import { readableError } from '../../utils/presentation';
import { ImagesPanel, ResultPanel } from './ArticleResults';
import { Settings } from './ArticleSettings';
import { extractArticle, prepareArticleHtml } from './articleProcessing';

function revokeImageUrls(images = []) {
  const urls = new Set();
  images.forEach((image) => {
    if (image.dataUrl?.startsWith('blob:')) urls.add(image.dataUrl);
    if (image.optimized?.dataUrl?.startsWith('blob:')) urls.add(image.optimized.dataUrl);
  });
  urls.forEach((url) => URL.revokeObjectURL(url));
}

export function ArticleConverterPage() {
  const [state, setState] = useState(ARTICLE_INITIAL_STATE);
  const [options, setOptions] = useState({
    ulClass: '',
    tableClass: '',
    tableWrapperClass: '',
    imageExtension: 'webp',
    compressionMode: 'balanced',
  });
  const [selectionError, setSelectionError] = useState('');
  const runIdRef = useRef(0);
  const baseName = getBaseName(state.fileName || 'document');
  useEffect(() => () => {
    runIdRef.current += 1;
  }, []);
  useEffect(() => () => revokeImageUrls(state.images), [state.images]);

  const handleFile = (files) => {
    const incomingFiles = Array.from(files || []);
    if (!incomingFiles.length) return;
    if (incomingFiles.length !== 1) {
      setSelectionError('Для статьи можно добавить только один DOCX. Очередь не изменена.');
      return;
    }
    const basicError = getBasicQueueError(incomingFiles);
    if (basicError) {
      setSelectionError(`${basicError} Очередь не изменена.`);
      return;
    }
    const file = incomingFiles[0];
    if (!/\.docx$/i.test(file.name)) {
      setSelectionError('Добавьте документ Word с расширением .docx. Очередь не изменена.');
      return;
    }
    runIdRef.current += 1;
    setState({
      ...ARTICLE_INITIAL_STATE,
      selectedFile: file,
      fileName: file.name,
      status: 'ready',
    });
    setSelectionError('');
  };

  const clearSelectedFile = () => {
    runIdRef.current += 1;
    setState(ARTICLE_INITIAL_STATE);
    setSelectionError('');
  };

  const convertDocument = async () => {
    if (!state.selectedFile || state.status === 'processing') return;
    const runId = ++runIdRef.current;
    const file = state.selectedFile;
    setState((current) => ({
      ...current,
      sourceHtml: '',
      cleanedHtml: '',
      markdown: '',
      plainText: '',
      images: [],
      fixes: [],
      messages: [],
      status: 'processing',
      progress: 4,
      progressLabel: 'Готовим документ',
      error: '',
      copyStatus: 'idle',
    }));
    try {
      const result = await extractArticle(file, options, (progress, progressLabel) => {
        if (runId !== runIdRef.current) return;
        setState((current) => ({ ...current, progress, progressLabel }));
      });
      if (runId !== runIdRef.current) {
        revokeImageUrls(result.images);
        return;
      }
      setState((current) => ({
        ...current,
        ...result,
        selectedFile: file,
        fileName: file.name,
        status: 'converted',
        progress: 100,
        progressLabel: 'Готово',
        error: '',
      }));
    } catch (error) {
      if (runId !== runIdRef.current) return;
      setState((current) => ({
        ...current,
        status: 'error',
        progress: 0,
        progressLabel: '',
        error: readableError(error, 'Не удалось обработать документ.'),
      }));
    }
  };

  const updateOptions = (patch) => {
    const nextOptions = { ...options, ...patch };
    setOptions(nextOptions);
    const imageFormatChanged = (patch.imageExtension && patch.imageExtension !== options.imageExtension)
      || (patch.compressionMode && patch.compressionMode !== options.compressionMode);
    if (imageFormatChanged && state.status === 'converted') {
      runIdRef.current += 1;
      setState({
        ...ARTICLE_INITIAL_STATE,
        selectedFile: state.selectedFile,
        fileName: state.fileName,
        status: 'ready',
      });
      return;
    }
    if (state.sourceHtml && state.status !== 'processing') {
      try {
        const cleanResult = prepareArticleHtml(state.sourceHtml, nextOptions, state.images);
        setState((current) => ({
          ...current,
          cleanedHtml: cleanResult.html,
          markdown: htmlToMarkdown(cleanResult.html),
          plainText: htmlToPlainText(cleanResult.html),
          fixes: cleanResult.fixes,
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          error: readableError(error, 'Не удалось применить настройки очистки.'),
        }));
      }
    }
  };

  const copyValue = async (value) => {
    try {
      await copyToClipboard(value);
      setState((current) => ({ ...current, copyStatus: 'copied', error: '' }));
      window.setTimeout(() => {
        setState((current) => ({ ...current, copyStatus: 'idle' }));
      }, 1600);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: readableError(error, 'Браузер не разрешил скопировать результат.'),
      }));
    }
  };

  const downloadCurrent = (type, content) => {
    const formats = {
      html: { extension: 'html', mime: 'text/html;charset=utf-8' },
      markdown: { extension: 'md', mime: 'text/markdown;charset=utf-8' },
      text: { extension: 'txt', mime: 'text/plain;charset=utf-8' },
      manifest: { extension: 'json', mime: 'application/json;charset=utf-8' },
    };
    const format = formats[type] || formats.html;
    downloadText(content, sanitizeFileName(baseName) + '_lotus.' + format.extension, format.mime);
  };

  return (
    <section className="page">
      <PageHead
        eyebrow="DOCX → готовая публикация"
        title="Из Word — в готовую статью"
        text="Добавьте DOCX, нажмите «Обработать статью» и скачайте архив с HTML, Markdown и изображениями. Структура документа сохранится, лишнее оформление исчезнет."
        aside={<span className="privacy-badge"><span aria-hidden="true">●</span> Файл не загружается на сервер</span>}
      />
      <div className={'upload-row article-upload' + (state.selectedFile ? ' article-upload--selected' : '')}>
        <div className="upload-stack">
          <UploadZone
            id="article-upload-trigger"
            accept={ACCEPT_BY_FORMAT.docx}
            badge="DOCX"
            describedBy={selectionError ? 'article-file-queue-error' : undefined}
            disabled={state.status === 'processing'}
            hint="Документ Word или экспорт из Google Docs"
            onFiles={handleFile}
            title={state.selectedFile ? 'Заменить DOCX' : 'Перетащите DOCX или выберите файл'}
          />
          <FileQueue
            compact
            id="article-file-queue"
            files={state.selectedFile ? [state.selectedFile] : []}
            error={selectionError}
            disabled={state.status === 'processing'}
            getFormat={() => 'docx'}
            onClear={clearSelectedFile}
            onRemove={clearSelectedFile}
            uploadTriggerId="article-upload-trigger"
          />
        </div>
        <button
          className="button button--large"
          type="button"
          disabled={!state.selectedFile || state.status === 'processing'}
          onClick={convertDocument}
        >
          {state.status === 'processing'
            ? <><span className="spinner spinner--button" aria-hidden="true" />Обработка</>
            : state.status === 'converted' ? 'Обновить результат' : 'Обработать статью'}
        </button>
      </div>
      <StatusNotice
        status={state.status}
        progress={state.progress}
        label={state.progressLabel}
        error={state.error}
      />
      <Settings options={options} onOptionsChange={updateOptions} disabled={state.status === 'processing'} />
      <ResultPanel
        state={state}
        baseName={baseName}
        onCopy={copyValue}
        onDownload={downloadCurrent}
        onTabChange={(activeTab) => setState((current) => ({ ...current, activeTab }))}
      />
      <ImagesPanel images={state.images} baseName={baseName} converted={state.status === 'converted'} />
    </section>
  );
}
