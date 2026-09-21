export const ROUTES = [
  { id: 'conversions', label: 'Конвертер' },
  { id: 'optimize', label: 'Оптимизация' },
  { id: 'vectorize', label: 'Векторизация' },
  { id: 'articles', label: 'Статья из DOCX', cta: true },
];

export const SEO_BY_ROUTE = {
  home: {
    title: 'Lotus Docs — Быстрый конвертер и оптимизация документов',
    description: 'Lotus Docs — локальный онлайн-конвертер и оптимизатор документов, изображений и таблиц без загрузки файлов на сервер.',
  },
  conversions: {
    title: 'Конвертер файлов — изображения, DOCX и таблицы | Lotus Docs',
    description: 'Конвертируйте изображения, DOCX, XLSX и CSV прямо в браузере. Пакетная обработка, очередь задач и безопасное локальное скачивание.',
  },
  optimize: {
    title: 'Сжатие изображений с контролем качества | Lotus Docs',
    description: 'Оптимизируйте PNG, JPEG, WebP, BMP и TIFF локально, сохраняя размеры изображения и контролируя баланс качества и веса.',
  },
  vectorize: {
    title: 'Векторизация изображений в SVG онлайн | Lotus Docs',
    description: 'Преобразуйте PNG, JPEG и WebP в редактируемый SVG с настройкой детализации, сглаживания и количества цветов.',
  },
  articles: {
    title: 'DOCX в чистый HTML и Markdown онлайн | Lotus Docs',
    description: 'Подготовьте статью из DOCX: чистый HTML, Markdown, текст, изображения и manifest в одном локальном рабочем процессе.',
  },
};
