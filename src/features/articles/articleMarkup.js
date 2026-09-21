import { cleanDocumentHtml } from '../../utils/htmlCleaner.js';

/** CMS export: image markers are separate blocks, never nested in text or bold tags. */
export function prepareArticleHtml(sourceHtml, options = {}) {
  const doc = new DOMParser().parseFromString(sourceHtml, 'text/html');
  const images = [...doc.querySelectorAll('img')];
  const numbers = new Map(images.map((image, index) => [image, index + 1]));
  let splitCount = 0;
  for (const paragraph of [...doc.querySelectorAll('p')]) {
    if (paragraph.closest('pre')) continue;
    const separators = [...paragraph.querySelectorAll('img, br')];
    if (!separators.length) continue;
    const output = doc.createDocumentFragment();
    let start = null;
    const appendText = (end) => {
      const range = doc.createRange();
      if (start) range.setStartAfter(start);
      else range.setStart(paragraph, 0);
      if (end) range.setEndBefore(end);
      else range.setEnd(paragraph, paragraph.childNodes.length);
      const fragment = range.cloneContents();
      if (!fragment.textContent.trim() && !fragment.querySelector('code, svg')) return;
      const block = paragraph.cloneNode(false);
      block.append(fragment);
      output.append(block);
    };
    for (const separator of separators) {
      appendText(separator);
      if (separator.tagName === 'IMG') output.append(doc.createComment(` img${numbers.get(separator)} `));
      start = separator;
    }
    appendText(null);
    paragraph.replaceWith(output);
    splitCount++;
  }
  // Images in list items, table cells and other containers retain their position.
  for (const image of images) {
    if (doc.contains(image)) image.replaceWith(doc.createComment(` img${numbers.get(image)} `));
  }
  for (const wrapper of [...doc.querySelectorAll('strong, b, em, i, span')].reverse()) {
    if (!wrapper.textContent.trim()) wrapper.replaceWith(...wrapper.childNodes);
  }
  for (const cell of doc.querySelectorAll('th')) {
    if (cell.children.length === 1 && ['STRONG', 'B'].includes(cell.firstElementChild.tagName)
      && cell.textContent.trim() === cell.firstElementChild.textContent.trim()) {
      cell.firstElementChild.replaceWith(...cell.firstElementChild.childNodes);
    }
  }
  const result = cleanDocumentHtml(doc.body.innerHTML, { ...options, imageMode: 'comment' });
  if (images.length) result.fixes.push(`Изображения заменены маркерами img1–img${images.length}; файлы сохранены отдельно`);
  if (splitCount) result.fixes.push('Убраны пустые переносы; текст и маркеры изображений разделены на блоки');
  return result;
}

export function articlePreviewHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, 128);
  const markers = [];
  while (walker.nextNode()) if (/^\s*img\d+\s*$/.test(walker.currentNode.nodeValue)) markers.push(walker.currentNode);
  markers.forEach(comment => {
    const marker = doc.createElement('span');
    marker.className = 'article-image-marker';
    marker.textContent = comment.nodeValue.trim();
    comment.replaceWith(marker);
  });
  doc.querySelectorAll('a').forEach(node => { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); });
  return doc.body.innerHTML;
}
