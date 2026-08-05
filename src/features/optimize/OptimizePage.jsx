import { useEffect, useRef, useState } from 'react';
import { FileQueue } from '../../components/ui/FileQueue';
import { PageHead } from '../../components/ui/PageHead';
import { ResultCards } from '../../components/ui/ResultCards';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { UploadZone } from '../../components/ui/UploadZone';
import { RASTER_FORMATS } from '../../constants/formats';
import { usePreviewRegistry } from '../../hooks/usePreviewRegistry';
import { downloadResults, yieldToBrowser } from '../../utils/browserFiles';
import { decorateConversionResult } from '../../utils/conversionResults';
import { detectSourceFormat, optimizeRasterImage } from '../../utils/fileConverters';
import { appendUniqueFiles, getBasicQueueError } from '../../utils/fileQueue';
import { formatBytes, formatPercent, readableError, unpackProgress } from '../../utils/presentation';

export function OptimizePage() {
  const [files, setFiles] = useState([]);
  const [format, setFormat] = useState('webp');
  const [targetSaving, setTargetSaving] = useState(35);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [admissionPending, setAdmissionPending] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const filesRef = useRef([]);
  const runIdRef = useRef(0);
  const queueGenerationRef = useRef(0);
  const admissionChainRef = useRef(Promise.resolve());
  const admissionCountRef = useRef(0);
  const mountedRef = useRef(true);
  const detectedFormatsRef = useRef(new WeakMap());
  const { createPreview, clearPreviews } = usePreviewRegistry();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueGenerationRef.current += 1;
      runIdRef.current += 1;
    };
  }, []);

  const resetOutput = (nextStatus = 'idle') => {
    runIdRef.current += 1;
    clearPreviews();
    setResults([]);
    setStatus(nextStatus);
    setProgress(0);
    setProgressLabel('');
    setError('');
  };

  const handleFiles = (nextFiles) => {
    const incomingFiles = Array.from(nextFiles || []);
    if (!incomingFiles.length) return;
    const generation = queueGenerationRef.current;
    admissionCountRef.current += 1;
    setAdmissionPending(true);
    admissionChainRef.current = admissionChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (generation !== queueGenerationRef.current) return;
        const basicError = getBasicQueueError(incomingFiles);
        if (basicError) {
          setSelectionError(`${basicError} Очередь не изменена.`);
          return;
        }
        let formats;
        try {
          formats = await Promise.all(incomingFiles.map((file) => Promise.resolve(detectSourceFormat(file))));
        } catch {
          if (generation === queueGenerationRef.current) {
            setSelectionError('Не удалось прочитать добавляемые изображения. Очередь не изменена.');
          }
          return;
        }
        if (generation !== queueGenerationRef.current) return;
        if (formats.some((detected) => !RASTER_FORMATS.has(detected))) {
          setSelectionError('Добавьте PNG, JPEG, WebP, BMP или TIFF. Очередь не изменена.');
          return;
        }

        const mergeResult = appendUniqueFiles(filesRef.current, incomingFiles);
        if (!mergeResult.addedCount) {
          setSelectionError('Все выбранные изображения уже находятся в очереди.');
          return;
        }
        incomingFiles.forEach((file, index) => detectedFormatsRef.current.set(file, formats[index]));
        filesRef.current = mergeResult.files;
        setFiles(mergeResult.files);
        setSelectionError(mergeResult.duplicateCount ? 'Повторно выбранные изображения пропущены.' : '');
        resetOutput('ready');
      })
      .catch(() => {
        if (generation === queueGenerationRef.current) {
          setSelectionError('Не удалось проверить добавляемые изображения. Очередь не изменена.');
        }
      })
      .finally(() => {
        admissionCountRef.current = Math.max(0, admissionCountRef.current - 1);
        if (!admissionCountRef.current && mountedRef.current) setAdmissionPending(false);
      });
  };

  const removeQueuedFile = (index) => {
    queueGenerationRef.current += 1;
    const nextFiles = filesRef.current.filter((_, fileIndex) => fileIndex !== index);
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    setSelectionError('');
    resetOutput(nextFiles.length ? 'ready' : 'idle');
  };

  const clearQueue = () => {
    queueGenerationRef.current += 1;
    filesRef.current = [];
    setFiles([]);
    setSelectionError('');
    resetOutput('idle');
  };

  const optimizeFiles = async () => {
    if (!files.length || status === 'processing' || admissionCountRef.current) return;
    queueGenerationRef.current += 1;
    const runId = ++runIdRef.current;
    const filesToProcess = filesRef.current;
    clearPreviews();
    setResults([]);
    setStatus('processing');
    setProgress(2);
    setError('');
    const processed = [];
    for (let index = 0; index < filesToProcess.length; index += 1) {
      const file = filesToProcess[index];
      try {
        const output = await optimizeRasterImage(file, format, {
          preserveDimensions: true,
          targetSavings: targetSaving / 100,
          targetReduction: targetSaving / 100,
          createPreview: false,
          onProgress: (value, label) => {
            if (runId !== runIdRef.current) return;
            const currentProgress = unpackProgress(value, label || 'Подбираем качество для ' + file.name);
            setProgress(((index + Math.max(0, Math.min(100, currentProgress.percent)) / 100) / filesToProcess.length) * 100);
            setProgressLabel(currentProgress.label);
          },
        });
        if (runId !== runIdRef.current) return;
        const decorated = await decorateConversionResult(output, file, createPreview);
        if (runId !== runIdRef.current) {
          clearPreviews();
          return;
        }
        processed.push(decorated);
      } catch (optimizationError) {
        if (runId !== runIdRef.current) return;
        processed.push({
          id: file.name + '-' + file.lastModified,
          originalName: file.name,
          error: readableError(optimizationError, 'Не удалось оптимизировать файл.'),
        });
      }
      if (runId !== runIdRef.current) return;
      setProgress(((index + 1) / filesToProcess.length) * 100);
      setProgressLabel('Обработано ' + (index + 1) + ' из ' + filesToProcess.length);
      await yieldToBrowser();
    }
    if (runId !== runIdRef.current) return;
    setResults(processed);
    setStatus(processed.some((item) => item.blob) ? 'done' : 'error');
    setError(processed.some((item) => item.blob) ? '' : 'Ни одно изображение не удалось оптимизировать.');
  };

  const totalOriginal = results.reduce((sum, item) => sum + (item.originalSize || 0), 0);
  const totalOutput = results.reduce((sum, item) => sum + (item.outputSize || 0), 0);
  const totalSaved = Math.max(0, totalOriginal - totalOutput);
  const totalPercent = totalOriginal ? (totalSaved / totalOriginal) * 100 : 0;

  const downloadAll = async () => {
    setDownloadBusy(true);
    try {
      await downloadResults(results, 'lotus-optimized-images.zip');
    } catch (downloadError) {
      setError(readableError(downloadError, 'Не удалось подготовить скачивание.'));
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <section className="page">
      <PageHead
        eyebrow="Умное сжатие"
        title="Оптимизация без видимых потерь"
        text="Размеры в пикселях сохраняются. Для JPEG и WebP качество подбирается автоматически, PNG пересохраняется только lossless."
        aside={<span className="privacy-badge"><span aria-hidden="true">●</span> Исходники остаются у вас</span>}
      />
      <div className="conversion-workspace">
        <section className="conversion-column">
          <div className="column-head"><span>1</span><strong>Исходные изображения</strong></div>
          <UploadZone
            id="optimize-upload-trigger"
            accept=".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,image/png,image/jpeg,image/webp,image/bmp,image/tiff"
            badge="IMG"
            describedBy={selectionError ? 'optimize-file-queue-error' : undefined}
            disabled={status === 'processing'}
            hint="PNG, JPEG, WebP, BMP или TIFF · можно пакетом"
            multiple
            onFiles={handleFiles}
            title={files.length ? 'Добавить ещё изображения' : 'Добавьте изображения'}
          />
          <FileQueue
            id="optimize-file-queue"
            files={files}
            error={selectionError}
            disabled={status === 'processing'}
            getFormat={(file) => detectedFormatsRef.current.get(file)}
            onClear={clearQueue}
            onRemove={removeQueuedFile}
            uploadTriggerId="optimize-upload-trigger"
          />
        </section>
        <section className="conversion-column">
          <div className="column-head"><span>2</span><strong>Параметры результата</strong></div>
          <div className="target-panel optimize-settings">
            <label className="field">
              <span className="field__label">Формат</span>
              <select
                className="field__control"
                value={format}
                disabled={status === 'processing'}
                onChange={(event) => {
                  setFormat(event.target.value);
                  resetOutput(files.length ? 'ready' : 'idle');
                }}
              >
                <option value="webp">WebP · лучший баланс</option>
                <option value="jpeg">JPEG · совместимость</option>
                <option value="png">PNG · без потерь</option>
              </select>
            </label>
            <label className="range-field">
              <span><span className="field__label">Желаемая экономия</span><strong>{targetSaving}%</strong></span>
              <input
                type="range"
                min="10"
                max="65"
                step="5"
                value={targetSaving}
                disabled={format === 'png' || status === 'processing'}
                onChange={(event) => {
                  setTargetSaving(Number(event.target.value));
                  resetOutput(files.length ? 'ready' : 'idle');
                }}
              />
              <small>{format === 'png' ? 'Для PNG применяется только lossless-оптимизация.' : 'Алгоритм остановится раньше, если дальнейшее сжатие даст заметные артефакты.'}</small>
            </label>
            <button className="button button--large" type="button" disabled={!files.length || status === 'processing' || admissionPending} onClick={optimizeFiles}>
              {status === 'processing'
                ? <><span className="spinner spinner--button" aria-hidden="true" />Оптимизация</>
                : 'Оптимизировать'}
            </button>
          </div>
        </section>
      </div>
      <StatusNotice status={status} progress={progress} label={progressLabel} error={error} />
      {results.some((item) => item.blob) && (
        <div className="download-bar">
          <div>
            <strong>Экономия {formatBytes(totalSaved)} · {formatPercent(totalPercent)}</strong>
            <span>{formatBytes(totalOriginal)} → {formatBytes(totalOutput)}</span>
          </div>
          <button className="button" type="button" disabled={downloadBusy} onClick={downloadAll}>
            {downloadBusy ? 'Готовим…' : results.filter((item) => item.blob).length > 1 ? 'Скачать ZIP' : 'Скачать'}
          </button>
        </div>
      )}
      <ResultCards results={results} />
    </section>
  );
}
