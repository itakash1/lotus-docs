import { useEffect, useId, useRef, useState } from 'react';
import { getFileFormatLabel, isFilePreviewable } from '../../utils/fileQueue';
import { cx, formatBytes } from '../../utils/presentation';

const renderKeys = new WeakMap();
let nextRenderKey = 0;

function getRenderKey(file) {
  if (!renderKeys.has(file)) renderKeys.set(file, `queued-file-${++nextRenderKey}`);
  return renderKeys.get(file);
}

function formatQueueCount(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} файлов`;
  if (lastDigit === 1) return `${count} файл`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} файла`;
  return `${count} файлов`;
}

function FileThumbnail({ file, format }) {
  const [preview, setPreview] = useState('');
  const [failed, setFailed] = useState(false);
  const previewable = isFilePreviewable(file, format);

  useEffect(() => {
    setFailed(false);
    if (!previewable) {
      setPreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, previewable]);

  return (
    <span className="file-queue__thumbnail" aria-hidden="true">
      {preview && !failed
        ? <img src={preview} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span>{getFileFormatLabel(file, format)}</span>}
    </span>
  );
}

export function FileQueue({
  disabled = false,
  error = '',
  files,
  getFormat,
  id,
  onClear,
  onRemove,
  uploadTriggerId,
}) {
  const generatedId = useId();
  const listRef = useRef(null);
  const queueId = id || `file-queue-${generatedId.replace(/:/g, '')}`;
  const queuedFiles = Array.from(files || []);

  const restoreFocusAfterRemoval = (index) => {
    window.requestAnimationFrame(() => {
      const removeButtons = listRef.current?.querySelectorAll('.file-queue__remove') || [];
      const nextButton = removeButtons[Math.min(index, removeButtons.length - 1)];
      if (nextButton) nextButton.focus();
      else document.getElementById(uploadTriggerId)?.focus();
    });
  };

  const clearQueue = () => {
    onClear();
    window.requestAnimationFrame(() => document.getElementById(uploadTriggerId)?.focus());
  };

  return (
    <div
      className={cx('file-queue', !queuedFiles.length && 'file-queue--empty', error && 'file-queue--error')}
      data-file-queue=""
    >
      <span className="sr-only file-queue__announcement" role="status" aria-live="polite" aria-atomic="true">
        {queuedFiles.length
          ? `${formatQueueCount(queuedFiles.length)} в очереди. ${queuedFiles.length === 1 ? 'Выбран файл' : 'Последний файл'}: ${queuedFiles.at(-1).name}.`
          : 'Очередь файлов пуста.'}
      </span>
      {queuedFiles.length > 0 && (
        <>
          <div className="file-queue__header">
            <div>
              <strong id={`${queueId}-label`}>Очередь файлов</strong>
              <span>{formatQueueCount(queuedFiles.length)}</span>
            </div>
            <button
              className="file-queue__clear"
              type="button"
              disabled={disabled}
              aria-label="Очистить очередь файлов"
              onClick={clearQueue}
            >
              Очистить
            </button>
          </div>
          <ul className="file-queue__list" aria-labelledby={`${queueId}-label`} ref={listRef}>
            {queuedFiles.map((file, index) => (
              <li className="file-queue__item" data-file-queue-item="" key={getRenderKey(file)}>
                <FileThumbnail file={file} format={getFormat?.(file, index)} />
                <span className="file-queue__details">
                  <bdi className="file-queue__name" dir="auto" title={file.name}>{file.name}</bdi>
                  <span>{getFileFormatLabel(file, getFormat?.(file, index))} · {formatBytes(file.size)}</span>
                </span>
                <button
                  className="file-queue__remove"
                  type="button"
                  disabled={disabled}
                  aria-label={`Удалить файл «${file.name}», ${index + 1} из ${queuedFiles.length}, из очереди`}
                  onClick={() => {
                    onRemove(index);
                    restoreFocusAfterRemoval(index);
                  }}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="file-queue__error" id={`${queueId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
