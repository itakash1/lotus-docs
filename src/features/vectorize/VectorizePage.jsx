import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileQueue } from '../../components/ui/FileQueue';
import { PageHead } from '../../components/ui/PageHead';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { UploadZone } from '../../components/ui/UploadZone';
import { usePreviewRegistry } from '../../hooks/usePreviewRegistry';
import { downloadBlob } from '../../utils/browserFiles';
import { decorateConversionResult } from '../../utils/conversionResults';
import { detectSourceFormat, traceRasterToSvg } from '../../utils/fileConverters';
import { getBasicQueueError } from '../../utils/fileQueue';
import { formatBytes, readableError, unpackProgress } from '../../utils/presentation';

export function VectorizePage() {
  const [file, setFile] = useState(null);
  const [fileFormat, setFileFormat] = useState('');
  const [sourcePreview, setSourcePreview] = useState('');
  const [result, setResult] = useState(null);
  const [svgText, setSvgText] = useState('');
  const [mode, setMode] = useState('color');
  const [threshold, setThreshold] = useState(150);
  const [smoothing, setSmoothing] = useState(1.2);
  const [detail, setDetail] = useState(3);
  const [colors, setColors] = useState(16);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [admissionPending, setAdmissionPending] = useState(false);
  const runIdRef = useRef(0);
  const queueGenerationRef = useRef(0);
  const admissionChainRef = useRef(Promise.resolve());
  const admissionCountRef = useRef(0);
  const mountedRef = useRef(true);
  const {
    createPreview: createSourcePreview,
    clearPreviews: clearSourcePreviews,
  } = usePreviewRegistry();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueGenerationRef.current += 1;
      runIdRef.current += 1;
    };
  }, []);
  const {
    createPreview: createResultPreview,
    clearPreviews: clearResultPreviews,
  } = usePreviewRegistry();

  const resetResult = () => {
    runIdRef.current += 1;
    clearResultPreviews();
    setResult(null);
    setSvgText('');
    setProgress(0);
    setProgressLabel('');
    setError('');
    if (file) setStatus('ready');
  };

  const handleFile = (files) => {
    const incomingFiles = Array.from(files || []);
    if (!incomingFiles.length) return;
    const generation = queueGenerationRef.current;
    admissionCountRef.current += 1;
    setAdmissionPending(true);
    admissionChainRef.current = admissionChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (generation !== queueGenerationRef.current) return;
        if (incomingFiles.length !== 1) {
          setSelectionError('Для трассировки можно добавить только одно изображение. Очередь не изменена.');
          return;
        }
        const basicError = getBasicQueueError(incomingFiles);
        if (basicError) {
          setSelectionError(`${basicError} Очередь не изменена.`);
          return;
        }
        const nextFile = incomingFiles[0];
        let detected;
        try {
          detected = await Promise.resolve(detectSourceFormat(nextFile));
        } catch {
          if (generation === queueGenerationRef.current) {
            setSelectionError('Не удалось прочитать добавляемое изображение. Очередь не изменена.');
          }
          return;
        }
        if (generation !== queueGenerationRef.current) return;
        if (!['png', 'jpeg', 'webp'].includes(detected)) {
          setSelectionError('Для трассировки добавьте PNG, JPEG или WebP. Очередь не изменена.');
          return;
        }
        runIdRef.current += 1;
        clearSourcePreviews();
        clearResultPreviews();
        setFile(nextFile);
        setFileFormat(detected);
        setSourcePreview(createSourcePreview(nextFile));
        setResult(null);
        setSvgText('');
        setStatus('ready');
        setProgress(0);
        setError('');
        setSelectionError('');
      })
      .catch(() => {
        if (generation === queueGenerationRef.current) {
          setSelectionError('Не удалось проверить добавляемое изображение. Очередь не изменена.');
        }
      })
      .finally(() => {
        admissionCountRef.current = Math.max(0, admissionCountRef.current - 1);
        if (!admissionCountRef.current && mountedRef.current) setAdmissionPending(false);
      });
  };

  const clearSelectedFile = () => {
    queueGenerationRef.current += 1;
    runIdRef.current += 1;
    clearSourcePreviews();
    clearResultPreviews();
    setFile(null);
    setFileFormat('');
    setSourcePreview('');
    setResult(null);
    setSvgText('');
    setStatus('idle');
    setProgress(0);
    setProgressLabel('');
    setError('');
    setSelectionError('');
  };

  const trace = async () => {
    if (!file || status === 'processing' || admissionCountRef.current) return;
    queueGenerationRef.current += 1;
    const runId = ++runIdRef.current;
    clearResultPreviews();
    setResult(null);
    setSvgText('');
    setStatus('processing');
    setProgress(8);
    setProgressLabel('Декодируем растр');
    setError('');
    try {
      const output = await traceRasterToSvg(file, {
        mode,
        threshold: mode === 'monochrome' ? threshold : null,
        smoothing: smoothing / 3,
        detail: detail / 4,
        colors,
        createPreview: false,
        traceOptions: { numberofcolors: mode === 'monochrome' ? 2 : colors },
        onProgress: (value, label) => {
          if (runId !== runIdRef.current) return;
          const currentProgress = unpackProgress(value, label || 'Строим векторные контуры');
          setProgress(currentProgress.percent);
          setProgressLabel(currentProgress.label);
        },
      });
      if (runId !== runIdRef.current) return;
      const decorated = await decorateConversionResult(output, file, createResultPreview);
      if (runId !== runIdRef.current) {
        clearResultPreviews();
        return;
      }
      const text = output.meta?.svg || await output.blob.text();
      if (runId !== runIdRef.current) {
        clearResultPreviews();
        return;
      }
      decorated.meta = {
        ...decorated.meta,
        paths: (text.match(/<path\b/gi) || []).length,
      };
      setResult(decorated);
      setSvgText(text);
      setStatus('done');
      setProgress(100);
      setProgressLabel('SVG готов');
    } catch (traceError) {
      if (runId !== runIdRef.current) return;
      setStatus('error');
      setError(readableError(traceError, 'Не удалось выполнить трассировку.'));
    }
  };

  return (
    <section className="page">
      <PageHead
        eyebrow="Растр → вектор"
        title="Изображение → SVG"
        text="Точная локальная трассировка логотипов, иконок и иллюстраций. Настройте порог, сглаживание и количество цветов."
        aside={<span className="privacy-badge"><span aria-hidden="true">●</span> Без загрузки в облако</span>}
      />
      <div className="vector-workspace">
        <section className="vector-sidebar">
          <UploadZone
            id="vectorize-upload-trigger"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            badge="IMG"
            describedBy={selectionError ? 'vectorize-file-queue-error' : undefined}
            disabled={status === 'processing'}
            hint="PNG, JPEG или WebP · лучше всего работают логотипы и графика"
            onFiles={handleFile}
            title={file ? 'Заменить изображение' : 'Добавьте растр'}
          />
          <FileQueue
            id="vectorize-file-queue"
            files={file ? [file] : []}
            error={selectionError}
            disabled={status === 'processing'}
            getFormat={() => fileFormat}
            onClear={clearSelectedFile}
            onRemove={clearSelectedFile}
            uploadTriggerId="vectorize-upload-trigger"
          />
          <div className="vector-settings">
            <label className="field">
              <span className="field__label">Режим трассировки</span>
              <select
                className="field__control"
                value={mode}
                disabled={status === 'processing'}
                onChange={(event) => {
                  setMode(event.target.value);
                  resetResult();
                }}
              >
                <option value="color">Цветной</option>
                <option value="monochrome">Монохромный</option>
              </select>
            </label>
            <label className="range-field">
              <span><span className="field__label">Порог яркости</span><strong>{threshold}</strong></span>
              <input
                type="range"
                min="32"
                max="224"
                step="1"
                value={threshold}
                disabled={mode !== 'monochrome' || status === 'processing'}
                onChange={(event) => {
                  setThreshold(Number(event.target.value));
                  resetResult();
                }}
              />
              <small>{mode === 'monochrome' ? 'Определяет границу между светлыми и тёмными областями.' : 'Доступно в монохромном режиме.'}</small>
            </label>
            <label className="range-field">
              <span><span className="field__label">Сглаживание</span><strong>{smoothing.toFixed(1)}</strong></span>
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={smoothing}
                disabled={status === 'processing'}
                onChange={(event) => {
                  setSmoothing(Number(event.target.value));
                  resetResult();
                }}
              />
              <small>Убирает цифровой шум, сохраняя характер контура.</small>
            </label>
            <label className="range-field">
              <span><span className="field__label">Детализация</span><strong>{detail}/4</strong></span>
              <input
                type="range"
                min="1"
                max="4"
                step="1"
                value={detail}
                disabled={status === 'processing'}
                onChange={(event) => {
                  setDetail(Number(event.target.value));
                  resetResult();
                }}
              />
              <small>Высокое значение точнее, но создаёт более крупный SVG.</small>
            </label>
            {mode === 'color' && (
              <label className="range-field">
                <span><span className="field__label">Количество цветов</span><strong>{colors}</strong></span>
                <input
                  type="range"
                  min="4"
                  max="48"
                  step="2"
                  value={colors}
                  disabled={status === 'processing'}
                  onChange={(event) => {
                    setColors(Number(event.target.value));
                    resetResult();
                  }}
                />
                <small>Больше цветов точнее передаёт детали исходника.</small>
              </label>
            )}
            <button className="button button--large" type="button" disabled={!file || status === 'processing' || admissionPending} onClick={trace}>
              {status === 'processing'
                ? <><span className="spinner spinner--button" aria-hidden="true" />Трассировка</>
                : 'Создать SVG'}
            </button>
          </div>
        </section>
        <section className="vector-preview" aria-label="Сравнение исходника и SVG">
          {!file && (
            <EmptyState
              title="Здесь появится вектор"
              text="Загрузите изображение, настройте трассировку и сравните SVG с исходником."
            />
          )}
          {file && (
            <div className="comparison-grid">
              <article className="comparison-card">
                <header><span>Исходник</span><span>{formatBytes(file.size)}</span></header>
                <div className="comparison-card__media">
                  <img src={sourcePreview} alt="Исходное растровое изображение" />
                </div>
              </article>
              <article className="comparison-card">
                <header><span>SVG</span><span>{result ? formatBytes(result.outputSize) : 'Ожидает'}</span></header>
                <div className="comparison-card__media comparison-card__media--checker">
                  {result
                    ? <img src={result.preview} alt="Результат векторизации SVG" />
                    : <span className="comparison-card__placeholder">SVG</span>}
                </div>
              </article>
            </div>
          )}
          <StatusNotice status={status} progress={progress} label={progressLabel} error={error} />
          {result && (
            <div className="vector-result">
              <div>
                <span className="result-type">Готовый SVG</span>
                <strong>{result.fileName}</strong>
                <span>{result.meta?.paths?.toLocaleString('ru-RU') || '—'} контуров · {formatBytes(result.outputSize)}</span>
              </div>
              <button className="button" type="button" onClick={() => downloadBlob(result.blob, result.fileName)}>Скачать SVG</button>
            </div>
          )}
          {svgText && (
            <details className="svg-code">
              <summary>Посмотреть SVG-код</summary>
              <pre>{svgText.slice(0, 20000)}{svgText.length > 20000 ? '\n…' : ''}</pre>
            </details>
          )}
        </section>
      </div>
    </section>
  );
}
