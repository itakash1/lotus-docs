export const FORMAT_LABELS = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  bmp: 'BMP',
  tiff: 'TIFF',
  svg: 'SVG',
  docx: 'DOCX',
  html: 'HTML',
  pdf: 'PDF',
  xlsx: 'XLSX',
  csv: 'CSV',
  json: 'JSON',
};

export const SOURCE_FORMATS = ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg', 'docx', 'xlsx', 'csv'];
export const RASTER_FORMATS = new Set(['png', 'jpeg', 'webp', 'bmp', 'tiff']);
export const FORMAT_GROUPS = [
  { label: 'Изображения', formats: ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg'] },
  { label: 'Документы', formats: ['html', 'pdf'] },
  { label: 'Таблицы и данные', formats: ['csv', 'json'] },
];
export const ALL_SUPPORTED_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.svg,.docx,.xlsx,.csv,image/*,text/csv';

export const ACCEPT_BY_FORMAT = {
  png: '.png,image/png',
  jpeg: '.jpg,.jpeg,image/jpeg',
  webp: '.webp,image/webp',
  bmp: '.bmp,image/bmp',
  tiff: '.tif,.tiff,image/tiff',
  svg: '.svg,image/svg+xml',
  docx: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: '.csv,text/csv',
};
