import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_SUPPORTED_ACCEPT, FORMAT_LABELS, RASTER_FORMATS, SOURCE_FORMATS } from '../../constants/formats';
import { FileGlyph } from '../../components/ui/FileGlyph';
import { FileQueue } from '../../components/ui/FileQueue';
import { PageHead } from '../../components/ui/PageHead';
import { ResultCards } from '../../components/ui/ResultCards';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { UploadZone } from '../../components/ui/UploadZone';
import { usePreviewRegistry } from '../../hooks/usePreviewRegistry';
import { downloadResults, yieldToBrowser } from '../../utils/browserFiles';
import { decorateConversionResult } from '../../utils/conversionResults';
import { convertFile, detectSourceFormat, getTargetsForSource } from '../../utils/fileConverters';
import { appendUniqueFiles, getBasicQueueError } from '../../utils/fileQueue';
import { readableError, unpackProgress } from '../../utils/presentation';

export function FileConverterPage() {
  const [sourceFormat, setSourceFormat] = useState('auto');
  const targets = useMemo(() => getTargetsForSource(sourceFormat), [sourceFormat]);
  const [targetFormat, setTargetFormat] = useState('');
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [admissionPending, setAdmissionPending] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const filesRef = useRef([]);
  const sourceFormatRef = useRef('auto');
  const runIdRef = useRef(0);
  const queueGenerationRef = useRef(0);
  const admissionChainRef = useRef(Promise.resolve());
  const admissionCountRef = useRef(0);
  const mountedRef = useRef(true);
  const { createPreview, clearPreviews } = usePreviewRegistry();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueGenerationRef.current += 1;
      runIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!targets.includes(targetFormat)) setTargetFormat(targets[0] || '');
  }, [sourceFormat, targetFormat, targets]);

  const resetOutput = (nextStatus = 'idle') => {
    runIdRef.current += 1;
    clearPreviews();
    setResults([]);
    setStatus(nextStatus);
    setProgress(0);
    setProgressLabel('');
    setError('');
  };

  const changeSourceFormat = (nextSource) => {
    queueGenerationRef.current += 1;
    sourceFormatRef.current = nextSource;
    filesRef.current = [];
    setSourceFormat(nextSource);
    setFiles([]);
    setSelectionError('');
    resetOutput('idle');
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
        let detected;
        try {
          detected = await Promise.all(incomingFiles.map((file) => Promise.resolve(detectSourceFormat(file))));
        } catch {
          if (generation === queueGenerationRef.current) {
            setSelectionError('Не удалось прочитать добавляемые файлы. Очередь не изменена.');
          }
          return;
        }
        if (generation !== queueGenerationRef.current) return;
        const supported = detected.every((format) => format && SOURCE_FORMATS.includes(format));
        if (!supported) {
          setSelectionError(detected.includes('pdf') ? 'PDF поддерживается только как результат DOCX → PDF. Преобразование PDF в PNG и другие форматы здесь недоступно.' : 'Этот исходный формат не поддерживается. Добавьте изображение, DOCX, XLSX или CSV.');
          return;
        }
        const firstFormat = detected[0];
        if (!detected.every((format) => format === firstFormat)) {
          setSelectionError('В одну очередь можно добавлять файлы только одного исходного формата. Очередь не изменена.');
          return;
        }
        const acceptsMultiple = RASTER_FORMATS.has(firstFormat) || firstFormat === 'svg';
        if (!acceptsMultiple && incomingFiles.length > 1) {
          setSelectionError(`Для ${FORMAT_LABELS[firstFormat]} можно добавить только один файл за операцию.`);
          return;
        }
        const queuedFiles = filesRef.current;
        const queuedFormat = sourceFormatRef.current;
        if (queuedFiles.length && firstFormat !== queuedFormat) {
          setSelectionError(`В очереди уже находятся файлы ${FORMAT_LABELS[queuedFormat]}. Очистите её перед добавлением ${FORMAT_LABELS[firstFormat]}.`);
          return;
        }

        const mergeResult = acceptsMultiple
          ? appendUniqueFiles(queuedFiles, incomingFiles)
          : { addedCount: 1, duplicateCount: 0, files: [incomingFiles[0]] };
        if (!mergeResult.addedCount) {
          setSelectionError('Все выбранные файлы уже находятся в очереди.');
          return;
        }

        const nextTargets = getTargetsForSource(firstFormat);
        sourceFormatRef.current = firstFormat;
        filesRef.current = mergeResult.files;
        setSourceFormat(firstFormat);
        setTargetFormat((current) => (nextTargets.includes(current) ? current : (nextTargets[0] || '')));
        resetOutput('ready');
        setFiles(mergeResult.files);
        setSelectionError(mergeResult.duplicateCount ? 'Повторно выбранные файлы пропущены.' : '');
      })
      .catch(() => {
        if (generation === queueGenerationRef.current) {
          setSelectionError('Не удалось проверить добавляемые файлы. Очередь не изменена.');
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

  const runConversion = async () => {
    if (!files.length || !targetFormat || status === 'processing' || admissionCountRef.current) return;
    queueGenerationRef.current += 1;
    const runId = ++runIdRef.current;
    const filesToProcess = filesRef.current;
    const sourceToProcess = sourceFormatRef.current;
    const targetToProcess = targetFormat;
    clearPreviews();
    setResults([]);
    setStatus('processing');
    setProgress(2);
    setProgressLabel('Проверяем исходники');
    setError('');
    const processed = [];
    for (let index = 0; index < filesToProcess.length; index += 1) {
      const file = filesToProcess[index];
      try {
        const result = await convertFile(file, sourceToProcess, targetToProcess, {
          preserveDimensions: true,
          createPreview: false,
          onProgress: (value, label) => {
            if (runId !== runIdRef.current) return;
            const currentProgress = unpackProgress(value, label || 'Обрабатываем ' + file.name);
            const overall = ((index + Math.max(0, Math.min(100, currentProgress.percent)) / 100) / filesToProcess.length) * 100;
            setProgress(overall);
            setProgressLabel(currentProgress.label);
          },
        });
        if (runId !== runIdRef.current) return;
        const decorated = await decorateConversionResult(result, file, createPreview);
        if (runId !== runIdRef.current) {
          clearPreviews();
          return;
        }
        processed.push(decorated);
      } catch (conversionError) {
        if (runId !== runIdRef.current) return;
        processed.push({
          id: file.name + '-' + file.lastModified,
          originalName: file.name,
          error: readableError(conversionError),
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
    <section className="page converter-page">
      <PageHead eyebrow="Один файл. Новый формат." title="Конвертер файлов" text="Добавьте файл — определим его тип и предложим только доступные форматы. Всё происходит в вашем браузере." />
      <div className="converter-pair" aria-label="Настройка конвертации">
        <section className="converter-side">
          <h2 className="converter-side__label">01 / Исходный файл</h2>
          <UploadZone id="converter-upload-trigger" accept={ALL_SUPPORTED_ACCEPT + ',.pdf'}
            icon={<FileGlyph format={sourceFormat === 'auto' ? '+' : FORMAT_LABELS[sourceFormat]} ready={files.length > 0} />}
            describedBy={selectionError ? 'converter-file-queue-error' : undefined} disabled={status === 'processing'}
            hint={files.length ? 'Нажмите, чтобы добавить или заменить' : 'Или перетащите его сюда'} multiple onFiles={handleFiles}
            title={files.length === 1 ? files[0].name : files.length ? files.length + ' файлов выбрано' : 'Выберите файл'} />
          <label className="field"><span className="field__label">Что загружаем</span>
            <select className="field__control" value={sourceFormat} disabled={status === 'processing'} onChange={(event) => changeSourceFormat(event.target.value)}>
              <option value="auto">Определить автоматически</option>
              {SOURCE_FORMATS.map((format) => <option value={format} key={format}>{FORMAT_LABELS[format]}</option>)}
            </select>
          </label>
        </section>
        <span className="converter-direction" aria-hidden="true">→</span>
        <section className="converter-side">
          <h2 className="converter-side__label">02 / Готовый файл</h2>
          <div className={'converter-output' + (status === 'processing' ? ' converter-output--processing' : '')}>
            <FileGlyph format={FORMAT_LABELS[targetFormat] || '?'} ready={results.some(item => item.blob)} />
            <strong>{results.some(item => item.blob) ? 'Готово к скачиванию' : targetFormat ? 'Ваш файл в ' + FORMAT_LABELS[targetFormat] : 'Результат конвертации'}</strong>
            <span>{status === 'processing' ? 'Преобразуем…' : results.some(item => item.blob) ? 'Файл готов' : 'Появится автоматически'}</span>
          </div>
          <label className="field"><span className="field__label">Во что конвертируем</span>
            <select className="field__control" value={targetFormat} disabled={!targets.length || status === 'processing'} onChange={(event) => { setTargetFormat(event.target.value); resetOutput(files.length ? 'ready' : 'idle'); }}>
              {!targets.length && <option value="">Сначала добавьте файл</option>}
              {targets.map(format => <option value={format} key={format}>{FORMAT_LABELS[format]}</option>)}
            </select>
          </label>
        </section>
      </div>
      <FileQueue id="converter-file-queue" files={files} error={selectionError} disabled={status === 'processing'} getFormat={() => sourceFormat} onClear={clearQueue} onRemove={removeQueuedFile} uploadTriggerId="converter-upload-trigger" />
      <div className="converter-action">
        <p>Только поддерживаемые направления. PDF → PNG недоступно.</p>
        <button className="button" type="button" disabled={!files.length || !targetFormat || status === 'processing' || admissionPending} onClick={runConversion}>
          {status === 'processing' ? <><span className="spinner spinner--button" aria-hidden="true" />Конвертация</> : 'Конвертировать'}
        </button>
      </div>
      <StatusNotice status={status} progress={progress} label={progressLabel} error={error} />
      {results.some(item => item.blob) && <div className="download-bar"><div><strong>Результат готов</strong><span>{results.filter(item => item.blob).length} файл(а)</span></div><button className="button" type="button" disabled={downloadBusy} onClick={downloadAll}>{downloadBusy ? 'Готовим…' : results.filter(item => item.blob).length > 1 ? 'Скачать ZIP' : 'Скачать файл'}</button></div>}
      <ResultCards results={results} />
    </section>
  );
}
