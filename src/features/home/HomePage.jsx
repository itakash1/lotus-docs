import { getPathForRoute } from '../../utils/routing';

const SERVICES = [
  {
    eyebrow: 'DOCX → HTML',
    title: 'Разместим статью быстро',
    text: 'Чистая разметка, изображения, manifest и готовый архив для публикации.',
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
    eyebrow: 'Без визуальных потерь',
    title: 'Оптимизация изображений',
    text: 'Адаптивный подбор качества для JPEG и WebP, lossless-путь для PNG.',
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
            Публикуйте быстрее.<br />
            <span>Без ручной рутины.</span>
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
        <div className="hero__orb" aria-hidden="true">
          <img src="/lotus.svg" alt="" />
        </div>
      </section>

      <section className="services-section" aria-labelledby="services-title">
        <div className="section-head">
          <div>
            <p className="page-head__eyebrow">Инструменты</p>
            <h2 id="services-title">Один набор для контента и файлов</h2>
          </div>
          <p>Каждая операция выполняется на стороне клиента.</p>
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
