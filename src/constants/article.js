export const IMAGE_EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
};

export const ARTICLE_INITIAL_STATE = {
  selectedFile: null,
  fileName: '',
  sourceHtml: '',
  cleanedHtml: '',
  markdown: '',
  plainText: '',
  images: [],
  fixes: [],
  messages: [],
  activeTab: 'html',
  status: 'idle',
  progress: 0,
  progressLabel: '',
  error: '',
  copyStatus: 'idle',
};
