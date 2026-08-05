import { useEffect, useRef, useState } from 'react';
import { cx } from '../../utils/presentation';

export function UploadZone({
  accept,
  badge,
  describedBy,
  disabled = false,
  hint,
  id,
  multiple = false,
  onFiles,
  title,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (disabled) setDragging(false);
  }, [disabled]);
  const handleFiles = (files) => {
    if (!disabled && files?.length) onFiles(Array.from(files));
  };
  return (
    <>
      <button
        id={id}
        className={cx('upload-zone', dragging && 'upload-zone--dragging')}
        type="button"
        disabled={disabled}
        aria-describedby={describedBy}
        data-upload-zone=""
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
          if (!disabled) setDragging(true);
        }}
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
        <span className="upload-zone__title">{title}</span>
        <span className="upload-zone__hint">{hint}</span>
      </button>
      <input
        className="hidden-input"
        ref={inputRef}
        type="file"
        accept={accept}
        aria-hidden="true"
        disabled={disabled}
        multiple={multiple}
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </>
  );
}
