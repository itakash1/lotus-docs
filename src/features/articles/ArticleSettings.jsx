import { useId, useState } from 'react';

export function Settings({ options, onOptionsChange, disabled }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
  return (
    <section className="settings" aria-label="Настройки экспорта">
      <div className="field field--static">
        <span className="field__label">Изображения в HTML</span>
        <strong className="field__value">&lt;!-- img1 --&gt;</strong>
      </div>
      <label className="field">
        <span className="field__label">Формат изображений</span>
        <select
          className="field__control"
          value={options.imageExtension}
          disabled={disabled}
          onChange={(event) => onOptionsChange({ imageExtension: event.target.value })}
        >
          <option value="png">PNG · без потерь</option>
          <option value="webp">WebP · адаптивно</option>
          <option value="jpeg">JPEG · адаптивно</option>
        </select>
      </label>
      <button
        className="button button--secondary settings__advanced-button"
        type="button"
        disabled={disabled}
        aria-expanded={advancedOpen}
        aria-controls={advancedId}
        onClick={() => setAdvancedOpen((value) => !value)}
      >
        {advancedOpen ? 'Скрыть настройки' : 'Дополнительные настройки'}
      </button>
      {advancedOpen && (
        <div className="settings__advanced" id={advancedId}>
          <label className="field">
            <span className="field__label">Класс ul</span>
            <input
              className="field__control"
              type="text"
              value={options.ulClass}
              disabled={disabled}
              placeholder="content-list"
              onChange={(event) => onOptionsChange({ ulClass: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Класс table</span>
            <input
              className="field__control"
              type="text"
              value={options.tableClass}
              disabled={disabled}
              placeholder="content-table"
              onChange={(event) => onOptionsChange({ tableClass: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Обёртка таблицы</span>
            <input
              className="field__control"
              type="text"
              value={options.tableWrapperClass}
              disabled={disabled}
              placeholder="table-container"
              onChange={(event) => onOptionsChange({ tableWrapperClass: event.target.value })}
            />
          </label>
        </div>
      )}
    </section>
  );
}
