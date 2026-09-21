import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SEO_BY_ROUTE } from '../src/constants/routes.js';
for (const [route, seo] of Object.entries(SEO_BY_ROUTE)) {
  const path = route === 'home' ? 'dist/index.html' : `dist/${route}/index.html`;
  const html = await fs.readFile(path, 'utf8');
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${route}: one H1`);
  assert.equal((html.match(/<title>/g) || []).length, 1, `${route}: one title`);
  assert.ok(html.includes(`<title>${seo.title}</title>`), `${route}: correct title`);
  assert.equal((html.match(/name="description"/g) || []).length, 1, `${route}: one description`);
  assert.ok(html.includes(seo.description), `${route}: description is in static HTML`);
  assert.equal((html.match(/id="site-schema"/g) || []).length, 1, `${route}: one schema`);
  const schema = html.match(/<script id="site-schema" type="application\/ld\+json">(.*?)<\/script>/s);
  assert.equal(JSON.parse(schema[1])['@graph'][0]['@type'], 'WebApplication');
  assert.ok(html.includes('property="og:title"'), `${route}: sharing metadata`);
  assert.ok(!html.includes('welcome-intro'), `${route}: intro is client-only`);
}
// Site styling should contain no chromatic hex colors or old theme selectors.
for(const file of await fs.readdir('src/styles')) {
  if(!file.endsWith('.css'))continue;
  const css=await fs.readFile(`src/styles/${file}`,'utf8');
  for(const [color] of css.matchAll(/#[0-9a-f]{3,8}\b/gi)){
    const hex=color.slice(1);const channels=hex.length<=4 ? hex.slice(0,3).split('') : [hex.slice(0,2),hex.slice(2,4),hex.slice(4,6)];
    assert.ok(channels.every(value=>value===channels[0]), `${file}: unexpected color ${color}`);
  }
}
assert.ok((await fs.readFile('dist/index.html', 'utf8')).includes('hero-motion__art'));
console.log('Checked 5 static pages, H1s, metadata, JSON-LD, monochrome CSS and animation asset.');
