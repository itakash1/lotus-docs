export async function decorateConversionResult(result, sourceFile, createPreview) {
  const mime = result.mime || result.blob?.type || 'application/octet-stream';
  let preview = result.preview || '';
  let textPreview = '';
  if (!preview && result.blob && mime.startsWith('image/')) {
    preview = createPreview(result.blob);
  }
  if (result.blob && (/^(text\/|application\/json)/.test(mime) || mime.includes('html') || mime.includes('csv'))) {
    textPreview = (await result.blob.text()).slice(0, 6000);
  }
  return {
    ...result,
    mime,
    preview,
    textPreview,
    originalName: sourceFile.name,
    originalSize: sourceFile.size,
    outputSize: result.blob?.size || 0,
  };
}
