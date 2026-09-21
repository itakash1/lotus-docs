import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSeo, siteOrigin } from './seo.js';
import { SEO_BY_ROUTE } from '../constants/routes.js';

test('each route has unique SEO metadata and valid application data', () => {
  const titles=new Set(),descriptions=new Set();
  for(const route of Object.keys(SEO_BY_ROUTE)){
    const seo=routeSeo(route,'https://example.org');
    titles.add(seo.title);descriptions.add(seo.description);
    assert.equal(seo.url,'https://example.org'+(route==='home'?'/':'/'+route));
    assert.equal(seo.structuredData['@graph'][0]['@type'],'WebApplication');
    assert.equal(seo.structuredData['@graph'][0].url,seo.url);
  }
  assert.equal(titles.size,5);assert.equal(descriptions.size,5);
});
test('canonical domain is not fabricated when deployment origin is unknown', () => {
  assert.equal(routeSeo('home').url,'');
  assert.equal(siteOrigin('https://example.org/'),'https://example.org');
  assert.throws(()=>siteOrigin('javascript:alert(1)'));
});
