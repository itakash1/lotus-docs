import { useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPT_BY_FORMAT, FORMAT_LABELS, RASTER_FORMATS, SOURCE_FORMATS } from '../../constants/formats';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHead } from '../../components/ui/PageHead';
import { ResultCards } from '../../components/ui/ResultCards';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { UploadZone } from '../../components/ui/UploadZone';
import { usePreviewRegistry } from '../../hooks/usePreviewRegistry';
import { downloadResults, yieldToBrowser } from '../../utils/browserFiles';
import { decorateConversionResult } from '../../utils/conversionResults';
import { convertFile, detectSourceFormat, getTargetsForSource } from '../../utils/fileConverters';
import { readableError, unpackProgress } from '../../utils/presentation';

export function FileConverterPage() {
  const [sourceFormat, setSourceFormat] = useState('png');
  const targets = useMemo(() => getTargetsForSource(sourceFormat), [sourceFormat]);
  const [targetFormat, setTargetFormat] = useState(() => getTargetsForSource('png')[0] || 'jpeg');
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const runIdRef = useRef(0);
  const { createPreview, clearPreviews } = usePreviewRegistry();

  useEffect(() => {
    if (!targets.includes(targetFormat)) setTargetFormat(targets[0] || '');
  }, [sourceFormat, targetFormat, targets]);

  const resetOutput = () => {
    runIdRef.current += 1;
    clearPreviews();
    setResults([]);
    setStatus('idle');
    setProgress(0);
    setProgressLabel('');
    setError('');
  };

  const changeSourceFormat = (nextSource) => {
    setSourceFormat(nextSource);
    setFiles([]);
    resetOutput();
  };

  const handleFiles = async (nextFiles) => {
    if (!nextFiles.length) return;
    const detected = await Promise.all(nextFiles.map((file) => Promise.resolve(detectSourceFormat(file))));
    const supported = detected.every((format) => format && SOURCE_FORMATS.includes(format));
    if (!supported) {
      setFiles([]);
      resetOutput();
      setError('Один или несколько файлов имеют неподдерживаемый формат.');
      return;
    }
    const firstFormat = detected[0];
    if (!detected.every((format) => format === firstFormat)) {
      setFiles([]);
      resetOutput();
      setError('Для пакетной конвертации выберите файлы одного исходного формата.');
      return;
    }
    const nextTargets = getTargetsForSource(firstFormat);
    setSourceFormat(firstFormat);
    if (!nextTargets.includes(targetFormat)) setTargetFormat(nextTargets[0] || '');
    resetOutput();
    setFiles(nextFiles);
    setStatus('ready');
  };

  const runConversion = async () => {
    if (!files.length || !targetFormat || status === 'processing') return;
    const runId = ++runIdRef.current;
    clearPreviews();
    setResults([]);
    setStatus('processing');
    setProgress(2);
    setProgressLabel('Проверяем исходники');
    setError('');
    const processed = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const result = await convertFile(file, sourceFormat, targetFormat, {
          preserveDimensions: true,
          createPreview: false,
          onProgress: (value, label) => {
            if (runId !== runIdRef.current) return;
            const currentProgress = unpackProgress(value, label || 'Обрабатываем ' + file.name);
            const overall = ((index + Math.max(0, Math.min(100, currentProgress.percent)) / 100) / files.length) * 100;
            setProgress(overall);
            setProgressLabel(currentProgress.label);
          },
        });
        if (runId !== runIdRef.current) return;
        processed.push(await decorateConversionResult(result, file, createPreview));
      } catch (conversionError) {
        processed.push({
          id: file.name + '-' + file.lastModified,
          originalName: file.name,
          error: readableError(conversionError),
        });
      }
      setProgress(((index + 1) / files.length) * 100);
      setProgressLabel('Обработано ' + (index + 1) + ' из ' + files.length);
      await yieldToBrowser();
    }
    if (runId !== runIdRef.current) return;
    setResults(processed);
    setStatus(processed.some((item) => item.blob) ? 'done' : 'error');
    setError(processed.some((item) => item.blob) ? '' : 'Ни один файл не удалось преобразовать.');
    setProgress(100);
    setProgressLabel('Готово');
  };

  const downloadAll = async () => {
    setDownloadBusy(true);
    setError('');
    try {
      await downloadResults(results, 'lotus-converted-files.zip');
    } catch (downloadError) {
      setError(readableError(downloadError, 'Не удалось подготовить скачивание.'));
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <section className="page">
      <PageHead
        eyebrow="Универсальная конвертация"
        title="Конвертер файлов"
        text="Изображения, документы и таблицы преобразуются прямо в браузере. Выберите пару форматов, добавьте файлы и скачайте результат."
        aside={<span className="privacy-badge"><span aria-hidden="true">●</span> 100% на устройстве</span>}
      />
      <div className="format-flow" aria-label="Настройка конвертации">
        <section className="format-card">
          <div className="column-head">
            <span>1</span>
            <strong>Исходный формат</strong>
          </div>
          <label className="field">
            <span className="field__label">Что загружаем</span>
            <select
              className="field__control field__control--large"
              value={sourceFormat}
              disabled={status === 'processing'}
              onChange={(event) => changeSourceFormat(event.target.value)}
            >
              {SOURCE_FORMATS.map((format) => (
                <option value={format} key={format}>{FORMAT_LABELS[format]}</option>
              ))}
            </select>
          </label>
          <UploadZone
            accept={ACCEPT_BY_FORMAT[sourceFormat]}
            badge={FORMAT_LABELS[sourceFormat]}
            disabled={status === 'processing'}
            fileName={files.length ? files.length === 1 ? files[0].name : files.length + ' файлов' : ''}
            hint={RASTER_FORMATS.has(sourceFormat) || sourceFormat === 'svg'
              ? 'Можно выбрать несколько файлов одного формата'
              : 'Один документ за операцию'}
            multiple={RASTER_FORMATS.has(sourceFormat) || sourceFormat === 'svg'}
            onFiles={handleFiles}
            title="Перетащите или выберите файл"
          />
        </section>
        <div className="format-flow__arrow" aria-hidden="true">→</div>
        <section className="format-card">
          <div className="column-head">
            <span>2</span>
            <strong>Формат результата</strong>
          </div>
          <label className="field">
            <span className="field__label">Во что конвертируем</span>
            <select
              className="field__control field__control--large"
              value={targetFormat}
              disabled={status === 'processing'}
              onChange={(event) => {
                setTargetFormat(event.target.value);
                resetOutput();
                if (files.length) setStatus('ready');
              }}
            >
              {targets.map((format) => (
                <option value={format} key={format}>{FORMAT_LABELS[format]}</option>
              ))}
            </select>
          </label>
          <div className="conversion-summary">
            <span>{FORMAT_LABELS[sourceFormat]}</span>
            <span aria-hidden="true">→</span>
            <strong>{FORMAT_LABELS[targetFormat]}</strong>
          </div>
          <p className="target-panel__note">
            {targetFormat === 'svg'
              ? 'Растр будет трассирован в редактируемые векторные контуры.'
              : 'Файл будет подготовлен локально без отправки третьим лицам.'}
          </p>
          <button className="button button--large" type="button" disabled={!files.length || status === 'processing'} onClick={runConversion}>
            {status === 'processing'
              ? <><span className="spinner spinner--button" aria-hidden="true" />Конвертация</>
              : 'Конвертировать'}
          </button>
        </section>
      </div>
      <StatusNotice status={status} progress={progress} label={progressLabel} error={error} />
      {status === 'ready' && (
        <EmptyState compact title="Файлы выбраны" text="Проверьте конечный формат и запустите конвертацию." />
      )}
      {results.some((item) => item.blob) && (
        <div className="download-bar">
          <div>
            <strong>Результат готов</strong>
            <span>{results.filter((item) => item.blob).length} файл(а)</span>
          </div>
          <button className="button" type="button" disabled={downloadBusy} onClick={downloadAll}>
            {downloadBusy ? 'Готовим архив…' : results.filter((item) => item.blob).length > 1 ? 'Скачать ZIP' : 'Скачать файл'}
          </button>
        </div>
      )}
      <ResultCards results={results} />
    </section>
  );
}
