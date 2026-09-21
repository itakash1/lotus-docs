import fs from 'node:fs/promises';
import { createServer, loadEnv } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SEO_BY_ROUTE } from '../src/constants/routes.js';
import { SITE_URL } from '../src/constants/site.js';
import { routeSeo, siteOrigin } from '../src/utils/seo.js';

const environment = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const origin = siteOrigin(environment.VITE_SITE_URL || SITE_URL);
const server = await createServer({ configFile: false, esbuild: { jsx: 'automatic', tsconfigRaw: {} }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, preTransformRequests: false }, appType: 'custom', logLevel: 'error' });
const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx');
  const template = (await fs.readFile('dist/index.html', 'utf8'))
    .replace(/<div id="root">[\s\S]*?<\/div>(?=\s*<noscript>)/, '<div id="root"></div>')
    .replace(/<meta (?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace(/<script id="site-schema"[\s\S]*?<\/script>/g, '');
  for (const route of Object.keys(SEO_BY_ROUTE)) {
    const seo = routeSeo(route, origin);
    const markup = renderToString(React.createElement(App, { initialRoute: route }));
    const metadata = `<meta property="og:title" content="${escape(seo.title)}"><meta property="og:description" content="${escape(seo.description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Lotus Docs"><meta property="og:locale" content="ru_RU"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(seo.title)}"><meta name="twitter:description" content="${escape(seo.description)}">${seo.url ? `<link rel="canonical" href="${escape(seo.url)}"><meta property="og:url" content="${escape(seo.url)}">` : ''}<script id="site-schema" type="application/ld+json">${JSON.stringify(seo.structuredData).replace(/</g, '\\u003c')}</script>`;
    const html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(seo.title)}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${escape(seo.description)}">`)
      .replace('</head>', metadata + '</head>').replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
    const dir = route === 'home' ? 'dist' : `dist/${route}`;
    await fs.mkdir(dir, { recursive: true }); await fs.writeFile(`${dir}/index.html`, html);
  }
  if (origin) {
    const urls = Object.keys(SEO_BY_ROUTE).map(route => `<url><loc>${escape(routeSeo(route, origin).url)}</loc></url>`).join('');
    await fs.writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }
  await fs.writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
  console.log(`Prerendered 5 routes.${origin ? ' Canonicals and sitemap generated.' : ' Set VITE_SITE_URL to generate canonical URLs and sitemap.'}`);
} finally { await server.close(); }
