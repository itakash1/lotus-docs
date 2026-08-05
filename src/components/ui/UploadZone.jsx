import { useRef, useState } from 'react';
import { cx } from '../../utils/presentation';

export function UploadZone({
  accept,
  badge,
  disabled = false,
  fileName,
  hint,
  multiple = false,
  onFiles,
  title,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const handleFiles = (files) => {
    if (!disabled && files?.length) onFiles(Array.from(files));
  };
  return (
    <>
      <button
        className={cx('upload-zone', dragging && 'upload-zone--dragging')}
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <span className="upload-zone__icon" aria-hidden="true">↗</span>
        <span className="upload-zone__badge">{badge}</span>
        <span className="upload-zone__title">{fileName || title}</span>
        <span className="upload-zone__hint">{hint}</span>
      </button>
      <input
        className="hidden-input"
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </>
  );
}
