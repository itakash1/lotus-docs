import { cx } from '../../utils/presentation';

export function EmptyState({ title, text, compact = false }) {
  return (
    <div className={cx('empty-state', compact && 'empty-state--compact')}>
      <span className="empty-state__mark" aria-hidden="true">✦</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
