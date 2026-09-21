import { SEO_BY_ROUTE } from '../constants/routes.js';
import { SITE_URL } from '../constants/site.js';

export function siteOrigin(value = '') {
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('VITE_SITE_URL must be an HTTP(S) URL');
  return url.origin;
}

export function routeSeo(route, origin = '') {
  const meta = SEO_BY_ROUTE[route] || SEO_BY_ROUTE.home;
  const path = route === 'home' ? '/' : `/${route}`;
  const url = origin ? origin + path : '';
  const graph = [{
    '@type': 'WebApplication', name: route === 'home' ? 'Lotus Docs' : meta.title.split(' | ')[0],
    description: meta.description, applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern browser',
    inLanguage: 'ru', isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    ...(url ? { url, '@id': url + '#application' } : {}),
  }];
  if (origin) {
    graph.push({ '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: 'Lotus Docs', inLanguage: 'ru' });
    if (route !== 'home') graph.push({ '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Lotus Docs', item: origin + '/' },
      { '@type': 'ListItem', position: 2, name: meta.title.split(' | ')[0], item: url },
    ] });
  }
  return { ...meta, url, structuredData: { '@context': 'https://schema.org', '@graph': graph } };
}

export function updateSeo(route) {
  const origin = siteOrigin(import.meta.env.VITE_SITE_URL || SITE_URL);
  const seo = routeSeo(route, origin);
  document.title = seo.title;
  const meta = (key, content, property = false) => {
    const attribute = property ? 'property' : 'name';
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) { node = document.createElement('meta'); node.setAttribute(attribute, key); document.head.append(node); }
    node.content = content;
  };
  meta('description', seo.description); meta('og:title', seo.title, true); meta('og:description', seo.description, true);
  meta('og:type', 'website', true); meta('og:site_name', 'Lotus Docs', true); meta('og:locale', 'ru_RU', true);
  meta('twitter:card', 'summary'); meta('twitter:title', seo.title); meta('twitter:description', seo.description);
  if (seo.url) {
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = seo.url; meta('og:url', seo.url, true);
  }
  let schema = document.getElementById('site-schema');
  if (!schema) { schema = document.createElement('script'); schema.id = 'site-schema'; schema.type = 'application/ld+json'; document.head.append(schema); }
  schema.textContent = JSON.stringify(seo.structuredData);
}
