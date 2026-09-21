import mammothModule from 'mammoth/mammoth.browser';

const mammoth = mammothModule?.default || mammothModule;

self.addEventListener('message', async (event) => {
  const { arrayBuffer } = event.data || {};
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    self.postMessage({ type: 'error', message: 'Не удалось прочитать содержимое DOCX.' });
    return;
  }

  try {
    const images = [];
    self.postMessage({ type: 'progress', value: 14, label: 'Читаем структуру DOCX' });

    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const number = images.length + 1;
          const contentType = image.contentType || 'application/octet-stream';
          images.push({ number, contentType });
          const base64 = await image.read('base64');
          images[number - 1].base64 = base64;
          self.postMessage({
            type: 'progress',
            value: Math.min(58, 18 + number * 2),
            label: `Извлекаем изображения: ${number}`,
          });
          return {
            src: `lotus-image:${number}`,
            alt: `Изображение ${number}`,
            'data-image-number': String(number),
          };
        }),
      },
    );

    self.postMessage({
      type: 'done',
      payload: {
        sourceHtml: result.value,
        images,
        messages: (result.messages || []).map((message) => ({
          type: message.type || 'warning',
          message: message.message || String(message),
        })),
      },
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка чтения DOCX.',
    });
  }
});
