import { FORMAT_LABELS } from '../../constants/formats';
import { downloadBlob } from '../../utils/browserFiles';
import { formatBytes, formatPercent } from '../../utils/presentation';

function describeMeta(item) {
  const pieces = [];
  if (item.meta?.width && item.meta?.height) pieces.push(item.meta.width + '×' + item.meta.height);
  if (item.meta?.quality) pieces.push('качество ' + Math.round(item.meta.quality * 100) + '%');
  if (item.meta?.sheetName) pieces.push('лист «' + item.meta.sheetName + '»');
  if (item.meta?.rows != null) pieces.push(item.meta.rows.toLocaleString('ru-RU') + ' строк');
  return pieces.join(' · ');
}

export function ResultCards({ results }) {
  if (!results.length) return null;
  return (
    <div className="conversion-results" aria-live="polite">
      <div className="section-head">
        <div>
          <p className="page-head__eyebrow">Результат</p>
          <h2>Готовые файлы</h2>
        </div>
        <p>{results.filter((item) => item.blob).length} из {results.length} обработано</p>
      </div>
      <div className="image-grid">
        {results.map((item, index) => {
          if (item.error) {
            return (
              <article className="image-card image-card--error" key={item.id || item.originalName + index}>
                <div className="image-card__body">
                  <span className="result-type">Ошибка</span>
                  <strong>{item.originalName}</strong>
                  <span>{item.error}</span>
                </div>
              </article>
            );
          }
          const saved = Math.max(0, item.originalSize - item.outputSize);
          const savedPercent = item.originalSize ? (saved / item.originalSize) * 100 : 0;
          const isImage = item.mime?.startsWith('image/');
          return (
            <article className="image-card" key={item.id || item.fileName + index} style={{ '--stagger': index }}>
              {isImage && item.preview && (
                <div className="image-card__media image-card__media--checker">
                  <img src={item.preview} alt={'Предпросмотр ' + item.fileName} loading="lazy" />
                </div>
              )}
              {item.textPreview && (
                <div className="file-preview">
                  <pre>{item.textPreview}</pre>
                </div>
              )}
              {!isImage && !item.textPreview && (
                <div className="file-placeholder" aria-hidden="true">
                  <span>{FORMAT_LABELS[item.fileName?.split('.').pop()?.toLowerCase()] || 'FILE'}</span>
                </div>
              )}
              <div className="image-card__body">
                <div className="image-card__meta">
                  <span>{item.mime}</span>
                  {saved > 0 && <span>−{formatPercent(savedPercent)}</span>}
                </div>
                <strong>{item.fileName}</strong>
                <span>{formatBytes(item.originalSize)} → {formatBytes(item.outputSize)}</span>
                {describeMeta(item) && <span>{describeMeta(item)}</span>}
                <button className="button button--secondary" type="button" onClick={() => downloadBlob(item.blob, item.fileName)}>
                  Скачать
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
