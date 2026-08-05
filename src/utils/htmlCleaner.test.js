import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fixBrokenTags,
  isSafeUrl,
  normalizeClassValue,
  normalizeTextValue,
} from './htmlCleaner.js';

test('fixBrokenTags joins a paragraph boundary emitted inside an anchor', () => {
  const source = '<p><a href="/article">first</p>\n<p>second</a></p>';
  assert.deepEqual(fixBrokenTags(source), {
    html: '<p><a href="/article">first second</a></p>',
    fixed: 1,
  });
});

test('fixBrokenTags does not confuse a greater-than sign inside an attribute with the tag end', () => {
  const source = '<p><a title="1 > 0" href="/article">first</p><p>second</a></p>';
  assert.deepEqual(fixBrokenTags(source), {
    html: '<p><a title="1 > 0" href="/article">first second</a></p>',
    fixed: 1,
  });
});

test('fixBrokenTags leaves valid adjacent block links separate', () => {
  const source = '<p><a href="/one">one</a></p><p><a href="/two">two</a></p>';
  assert.deepEqual(fixBrokenTags(source), { html: source, fixed: 0 });
});

test('fixBrokenTags also repairs formatting tags split by a list-item boundary', () => {
  const source = '<ul><li><strong>one</li><li>two</strong></li></ul>';
  assert.deepEqual(fixBrokenTags(source), {
    html: '<ul><li><strong>one two</strong></li></ul>',
    fixed: 1,
  });
});

test('normalizeTextValue collapses runs but preserves meaningful boundary spaces', () => {
  assert.equal(normalizeTextValue('  first\u00a0\n second  '), ' first second ');
  assert.equal(normalizeTextValue('word  , next'), 'word, next');
});

test('normalizeClassValue removes unsafe tokens, duplicates and excess whitespace', () => {
  assert.equal(normalizeClassValue('  table  sm:hover  table  bad"token '), 'table sm:hover');
});

test('isSafeUrl rejects executable schemes and accepts document URLs', () => {
  assert.equal(isSafeUrl('java\nscript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafeUrl('/articles/example#part'), true);
  assert.equal(isSafeUrl('https://example.com/article'), true);
  assert.equal(isSafeUrl('data:image/png;base64,iVBORw0KGgo=', { image: true }), true);
});
