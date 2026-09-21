import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('workspaces pass automated WCAG A and AA checks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/', '/articles', '/optimize', '/conversions', '/vectorize']) {
    await page.goto(path);
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations.map(v => ({ path, id: v.id, nodes: v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })) }))).toEqual([]);
  }
});

test('all workspaces fit mobile, tablet and desktop without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/', '/articles', '/optimize', '/conversions', '/vectorize']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('[data-theme-switch]')).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test('welcome repeats on new document loads, but not internal navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.welcome-intro')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.locator('.welcome-intro')).toHaveCount(0);
  await page.getByRole('link', { name: 'Подготовить статью', exact: true }).click();
  await expect(page.locator('.welcome-intro')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.welcome-intro')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.welcome-intro')).toHaveCount(0);
});

test('converter detects source type and rejects unsupported PDF input', async ({ page }) => {
  await page.goto('/conversions');
  await expect(page.getByLabel('Что загружаем')).toHaveValue('auto');
  await expect(page.getByLabel('Во что конвертируем')).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles({ name:'table.csv', mimeType:'text/csv', buffer:Buffer.from('name,value\na,1\n') });
  await expect(page.getByLabel('Что загружаем')).toHaveValue('csv');
  await expect(page.getByLabel('Во что конвертируем')).toHaveValue('json');
  await page.getByRole('button', { name:'Очистить очередь файлов' }).click();
  await page.locator('input[type=file]').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});
  await expect(page.locator('.file-queue__error')).toContainText('PDF поддерживается только');
  await expect(page.getByRole('button',{name:'Конвертировать',exact:true})).toBeDisabled();
});

test('balanced compression reduces a textured photograph rather than retaining the source', async ({ page }) => {
  await page.goto('/optimize');
  const result = await page.evaluate(async () => {
    const { optimizeRasterImage } = await import('/src/utils/fileConverters.js');
    const { COMPRESSION_PRESETS } = await import('/src/constants/compression.js');
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(800,600);
    let seed=42;
    for(let y=0;y<600;y++)for(let x=0;x<800;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const value=100+55*Math.sin(x/61)*Math.cos(y/83)+(seed>>>24)/12;
      const offset=(y*800+x)*4;
      pixels.data[offset]=value;pixels.data[offset+1]=value*.85;pixels.data[offset+2]=value*.65;pixels.data[offset+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const output=await optimizeRasterImage(new File([png],'photo.png',{type:'image/png'}),'webp',{...COMPRESSION_PRESETS.balanced,onlyIfSmaller:true,createPreview:false});
    return {original:png.size,output:output.blob.size,kept:output.meta.keptOriginal};
  });
  expect(result.output).toBeLessThan(result.original * .8);
  expect(result.kept).toBe(false);
});

test('optimization never grows files; conversion retains requested format', async ({ page }) => {
  await page.goto('/optimize');
  const results = await page.evaluate(async () => {
    const { optimizeRasterImage } = await import('/src/utils/fileConverters.js');
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(400, 300);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
    }
    ctx.putImageData(pixels, 0, 0);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .75));
    const file = new File([jpeg], 'photo.jpg', { type: 'image/jpeg' });
    const options = { createPreview: false, onlyIfSmaller: true };
    const retained = await optimizeRasterImage(file, 'png', options);
    const converted = await optimizeRasterImage(file, 'png', { createPreview: false });
    const compressed = await optimizeRasterImage(file, 'webp', options);
    return { original: file.size, retained: { size: retained.blob.size, name: retained.fileName, mime: retained.mime, ...retained.meta }, converted: { mime: converted.mime, name: converted.fileName }, compressed: { size: compressed.blob.size, ...compressed.meta } };
  });
  expect(results.retained.size).toBe(results.original);
  expect(results.retained.keptOriginal).toBe(true);
  expect(results.retained.mime).toBe('image/jpeg');
  expect(results.retained.name).toMatch(/\.jpe?g$/);
  expect(results.converted.mime).toBe('image/png');
  expect(results.converted.name).toMatch(/\.png$/);
  expect(results.compressed.size).toBeLessThanOrEqual(results.original);
  expect(results.compressed.width).toBe(400);
  expect(results.compressed.height).toBe(300);
});

test('optimization preserves transparent pixels when JPEG is selected', async ({ page }) => {
  await page.goto('/optimize');
  const result = await page.evaluate(async () => {
    const { optimizeRasterImage } = await import('/src/utils/fileConverters.js');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000'; ctx.fillRect(10, 10, 20, 20);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const output = await optimizeRasterImage(new File([png], 'transparent.png', { type: 'image/png' }), 'jpeg', { onlyIfSmaller: true, createPreview: false });
    return { mime: output.mime, preserved: output.meta.preservedTransparency, unchanged: await output.blob.text() === await png.text() };
  });
  expect(result).toEqual({ mime: 'image/png', preserved: true, unchanged: true });
});

test('CSV converts through the interface and downloads valid JSON', async ({ page }) => {
  await page.goto('/conversions');
  await page.getByLabel('Что загружаем').selectOption('csv');
  await page.locator('input[type=file]').setInputFiles({ name: 'table.csv', mimeType: 'text/csv', buffer: Buffer.from('name,value\n"Привет, мир",42\n') });
  await page.getByRole('button', { name: 'Конвертировать', exact: true }).click();
  await expect(page.locator('.image-card')).toContainText('table.json');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать файл', exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual([{ name: 'Привет, мир', value: '42' }]);
});

async function docxFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="img2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/></Relationships>');
  const picture = id => `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="95250" cy="95250"/><wp:docPr id="${id === 'img1' ? 1 : 2}" name="${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:t>Тестовая статья</w:t></w:r></w:p>${picture('img1')}${picture('img2')}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ячейка таблицы</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=', 'base64');
  zip.file('word/media/image1.png', png);
  zip.file('word/media/image2.png', png);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('DOCX exports CMS markers and separate numbered images', async ({ page }) => {
  await page.goto('/articles');
  await page.locator('input[type=file]').setInputFiles({ name: 'article.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await docxFixture() });
  await page.getByRole('button', { name: 'Обработать статью', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Скачать всё', exact: true })).toBeVisible();
  const preview = page.locator('.panel__body--preview');
  await expect(preview).toContainText('Тестовая статья');
  await expect(preview.locator('table')).toContainText('Ячейка таблицы');
  await expect(preview.locator('img')).toHaveCount(0);
  await expect(preview.locator('.article-image-marker')).toHaveText(['img1', 'img2']);
  await expect(page.getByText('Проверка орфографии', { exact: true })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать всё', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const html = await zip.file('article/article.html').async('string');
  expect(html).toContain('<meta charset="utf-8">');
  expect(html).not.toContain('blob:');
  expect(html).not.toContain('lotus-image:');
  expect(html).not.toContain('<img');
  expect(html.match(/<!-- img\d+ -->/g)).toEqual(['<!-- img1 -->', '<!-- img2 -->']);
  expect(zip.file('article/article.md')).not.toBeNull();
  expect(zip.file('article/article.txt')).not.toBeNull();
  const manifest = JSON.parse(await zip.file('article/manifest.json').async('string'));
  for (const image of manifest) expect(zip.file('article/images/' + image.fileName)).not.toBeNull();
  expect(new Set(manifest.map(image => image.number)).size).toBe(2);
  expect(manifest.every(image => image.outputSize <= image.originalSize)).toBe(true);
});

test('article sanitizer removes active content before preview', async ({ page }) => {
  await page.goto('/articles');
  const html = await page.evaluate(async () => {
    const { prepareArticleHtml } = await import('/src/features/articles/articleProcessing.js');
    return prepareArticleHtml('<p>Safe<script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="x" onerror="alert(1)" data-image-number="1"></p>', {}, [{ number: 1, name: 'image.png' }]).html;
  });
  expect(html).not.toMatch(/<script|javascript:|onerror=/i);
  expect(html).toContain('<!-- img1 -->');
});

test('real article fixture removes redundant breaks and preserves content around six markers', async ({ page }) => {
  await page.goto('/articles');
  const source = await fs.readFile(new URL('./fixtures/article-signs.html', import.meta.url), 'utf8');
  const result = await page.evaluate(async (source) => {
    const { prepareArticleHtml, articlePreviewHtml } = await import('/src/features/articles/articleMarkup.js');
    const { htmlToPlainText, htmlToMarkdown } = await import('/src/utils/htmlCleaner.js');
    const output = prepareArticleHtml(source).html;
    const original = new DOMParser().parseFromString(source, 'text/html');
    const cleaned = new DOMParser().parseFromString(output, 'text/html');
    const normalize = value => value.replace(/\s+/g, '');
    return { output, preview: articlePreviewHtml(output), markdown: htmlToMarkdown(output), text: htmlToPlainText(output),
      contentPreserved: normalize(original.body.textContent) === normalize(cleaned.body.textContent),
      links: cleaned.querySelectorAll('a').length, originalLinks: original.querySelectorAll('a').length,
      idempotent: prepareArticleHtml(output).html === output };
  }, source);
  expect(result.output).not.toMatch(/<img\b|<br\b|<th><strong>/i);
  expect(result.output.match(/<!-- img\d+ -->/g)).toEqual(Array.from({length:6}, (_,i)=>`<!-- img${i+1} -->`));
  expect(result.output).not.toMatch(/<(?:p|strong)>\s*<!-- img/);
  expect(result.contentPreserved).toBe(true);
  expect(result.links).toBe(result.originalLinks);
  expect(result.idempotent).toBe(true);
  expect(result.markdown).toContain('<!-- img6 -->');
  expect(result.text).toContain('img6');
  await fs.writeFile('test-results/article-cleaned.html', result.output);
});
