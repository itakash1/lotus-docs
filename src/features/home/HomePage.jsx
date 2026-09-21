import { getPathForRoute } from '../../utils/routing';
import { HeroMotion } from './HeroMotion';

const SERVICES = [
  {
    eyebrow: 'DOCX → HTML',
    title: 'Статья из Word',
    text: 'HTML, Markdown и изображения в одном архиве. Готово для вашего сайта.',
    page: 'articles',
    icon: 'article',
  },
  {
    eyebrow: '12 форматов',
    title: 'Конвертер файлов',
    text: 'Изображения, DOCX, XLSX и CSV преобразуются локально в браузере.',
    page: 'conversions',
    icon: 'convert',
  },
  {
    eyebrow: 'Меньше размер',
    title: 'Сжатие изображений',
    text: 'Уменьшайте вес фотографий. Если сжать не получилось — сохраним оригинал.',
    page: 'optimize',
    icon: 'optimize',
  },
  {
    eyebrow: 'Точная трассировка',
    title: 'Изображение → SVG',
    text: 'Настраиваемые детализация, сглаживание и цветность с предпросмотром.',
    page: 'vectorize',
    icon: 'vector',
  },
];

export function HomePage({ onNavigate }) {
  return (
    <>
      <section className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">Приватная обработка файлов в браузере</p>
          <h1 className="hero__title">
            Конвертер файлов.<br />
            <span>Без лишних действий.</span>
          </h1>
          <p className="hero__text">
            Lotus Docs превращает документы и изображения в аккуратные материалы для сайта.
            Файлы не покидают ваше устройство.
          </p>
          <div className="hero__actions">
            <a className="button" href="/articles" onClick={(event) => onNavigate(event, 'articles')}>Подготовить статью</a>
            <a className="button button--secondary" href="/conversions" onClick={(event) => onNavigate(event, 'conversions')}>Открыть конвертер</a>
          </div>
          <ul className="hero__trust" aria-label="Преимущества">
            <li><span aria-hidden="true">01</span> Локально</li>
            <li><span aria-hidden="true">02</span> Без регистрации</li>
            <li><span aria-hidden="true">03</span> Готово к публикации</li>
          </ul>
        </div>
        <HeroMotion />
      </section>

      <section className="services-section" aria-labelledby="services-title">
        <div className="section-head">
          <div>
            <p className="page-head__eyebrow">Инструменты</p>
            <h2 id="services-title">Что нужно сделать?</h2>
          </div>
          <p>Выберите инструмент — и добавьте файл.</p>
        </div>
        <div className="tools-grid">
          {SERVICES.map((service, index) => (
            <a
              className="tool-card"
              key={service.title}
              href={getPathForRoute(service.page)}
              onClick={(event) => onNavigate(event, service.page)}
              style={{ '--stagger': index }}
            >
              <span className="tool-card__number" aria-hidden="true">0{index + 1}</span>
              <span className="tool-card__eyebrow">{service.eyebrow}</span>
              <span className="tool-card__title">{service.title}</span>
              <span className="tool-card__text">{service.text}</span>
              <span className="tool-card__arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
