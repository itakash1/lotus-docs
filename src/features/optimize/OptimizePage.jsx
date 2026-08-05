import { useRef, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHead } from '../../components/ui/PageHead';
import { ResultCards } from '../../components/ui/ResultCards';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { UploadZone } from '../../components/ui/UploadZone';
import { RASTER_FORMATS } from '../../constants/formats';
import { usePreviewRegistry } from '../../hooks/usePreviewRegistry';
import { downloadResults, yieldToBrowser } from '../../utils/browserFiles';
import { decorateConversionResult } from '../../utils/conversionResults';
import { detectSourceFormat, optimizeRasterImage } from '../../utils/fileConverters';
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
  const [downloadBusy, setDownloadBusy] = useState(false);
  const runIdRef = useRef(0);
  const { createPreview, clearPreviews } = usePreviewRegistry();

  const handleFiles = async (nextFiles) => {
    const formats = await Promise.all(nextFiles.map((file) => Promise.resolve(detectSourceFormat(file))));
    if (!nextFiles.length || formats.some((detected) => !RASTER_FORMATS.has(detected))) {
      setFiles([]);
      setResults([]);
      setStatus('idle');
      setError('Выберите PNG, JPEG, WebP, BMP или TIFF.');
      return;
    }
    runIdRef.current += 1;
    clearPreviews();
    setFiles(nextFiles);
    setResults([]);
    setStatus('ready');
    setProgress(0);
    setError('');
  };

  const optimizeFiles = async () => {
    if (!files.length || status === 'processing') return;
    const runId = ++runIdRef.current;
    clearPreviews();
    setResults([]);
    setStatus('processing');
    setProgress(2);
    setError('');
    const processed = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const output = await optimizeRasterImage(file, format, {
          preserveDimensions: true,
          targetSavings: targetSaving / 100,
          targetReduction: targetSaving / 100,
          createPreview: false,
          onProgress: (value, label) => {
            if (runId !== runIdRef.current) return;
            const currentProgress = unpackProgress(value, label || 'Подбираем качество для ' + file.name);
            setProgress(((index + Math.max(0, Math.min(100, currentProgress.percent)) / 100) / files.length) * 100);
            setProgressLabel(currentProgress.label);
          },
        });
        if (runId !== runIdRef.current) return;
        processed.push(await decorateConversionResult(output, file, createPreview));
      } catch (optimizationError) {
        processed.push({
          id: file.name + '-' + file.lastModified,
          originalName: file.name,
          error: readableError(optimizationError, 'Не удалось оптимизировать файл.'),
        });
      }
      setProgress(((index + 1) / files.length) * 100);
      setProgressLabel('Обработано ' + (index + 1) + ' из ' + files.length);
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
            accept=".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,image/png,image/jpeg,image/webp,image/bmp,image/tiff"
            badge="IMG"
            disabled={status === 'processing'}
            fileName={files.length ? files.length === 1 ? files[0].name : files.length + ' изображений' : ''}
            hint="PNG, JPEG, WebP, BMP или TIFF · можно пакетом"
            multiple
            onFiles={handleFiles}
            title="Добавьте изображения"
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
                  clearPreviews();
                  setResults([]);
                  if (files.length) setStatus('ready');
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
                  clearPreviews();
                  setResults([]);
                  if (files.length) setStatus('ready');
                }}
              />
              <small>{format === 'png' ? 'Для PNG применяется только lossless-оптимизация.' : 'Алгоритм остановится раньше, если дальнейшее сжатие даст заметные артефакты.'}</small>
            </label>
            <button className="button button--large" type="button" disabled={!files.length || status === 'processing'} onClick={optimizeFiles}>
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
      {status === 'ready' && <EmptyState compact title="Изображения готовы" text="Настройте цель и запустите оптимизацию." />}
      <ResultCards results={results} />
    </section>
  );
}
