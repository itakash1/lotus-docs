export function StatusNotice({ status, progress = 0, label, error }) {
  if (error) {
    return <div className="status-card status-card--error" role="alert">{error}</div>;
  }
  if (status !== 'processing' && status !== 'downloading') return null;
  return (
    <div className="status-card" role="status" aria-live="polite" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <div className="status-card__content">
        <strong>{label || (status === 'downloading' ? 'Готовим скачивание' : 'Обрабатываем файл')}</strong>
        <div
          className="progress"
          role="progressbar"
          aria-label={label || 'Прогресс обработки'}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ width: Math.max(3, Math.min(100, progress)) + '%' }} />
        </div>
      </div>
      <span className="status-card__value">{Math.round(progress)}%</span>
    </div>
  );
}
