import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeUtf8 } from '../src/index.js';

/**
 * Helper: turn a hex string into a number array so test cases read as bytes.
 * Whitespace in the input is ignored, so multi-byte sequences can be lined up.
 */
function bytes(hex) {
  const clean = hex.replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

test('ASCII round-trips as single bytes', () => {
  const r = decodeUtf8(bytes('48 65 6c 6c 6f'));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
});

test('2-byte sequence decodes Latin-1 range', () => {
  const r = decodeUtf8(bytes('c3 a9')); // U+00E9 é
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, [0xe9]);
});

test('3-byte sequence decodes BMP', () => {
  const r = decodeUtf8(bytes('e2 82 ac')); // U+20AC €
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, [0x20ac]);
});

test('4-byte sequence decodes supplementary plane', () => {
  const r = decodeUtf8(bytes('f0 9f 92 a9')); // U+1F4A9
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, [0x1f4a9]);
});

test('mixed input decodes in order', () => {
  const r = decodeUtf8(bytes('41 c3 a9 e2 82 ac f0 9f 92 a9 42'));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, [0x41, 0xe9, 0x20ac, 0x1f4a9, 0x42]);
});

test('empty input yields empty codepoint list', () => {
  const r = decodeUtf8([]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, []);
});

test('lone continuation byte is rejected', () => {
  const r = decodeUtf8(bytes('80'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('lone continuation after valid ASCII is rejected at its own offset', () => {
  const r = decodeUtf8(bytes('41 80'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 1);
});

test('overlong 2-byte encoding of U+0000 is rejected', () => {
  // 0xC0 0x80 would decode to 0 if overlongs were allowed.
  const r = decodeUtf8(bytes('c0 80'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('overlong 3-byte encoding of U+007F is rejected', () => {
  // 0xE0 0x81 0xBF decodes to 0x7F if overlongs were allowed.
  const r = decodeUtf8(bytes('e0 81 bf'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('overlong 4-byte encoding of U+FFFF is rejected', () => {
  // 0xF0 0x8F 0xBF 0xBF decodes to 0xFFFF if overlongs were allowed.
  const r = decodeUtf8(bytes('f0 8f bf bf'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('lone high surrogate U+D800 is rejected', () => {
  const r = decodeUtf8(bytes('ed a0 80'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('lone low surrogate U+DFFF is rejected', () => {
  const r = decodeUtf8(bytes('ed bf bf'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('truncated 2-byte sequence at end of input is rejected at lead byte', () => {
  const r = decodeUtf8(bytes('c3'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('truncated 3-byte sequence interrupted by ASCII is rejected at lead byte', () => {
  // Lead promises two continuations; the second slot is ASCII 'A'.
  const r = decodeUtf8(bytes('e2 82 41'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('code point above U+10FFFF is rejected', () => {
  // 0xF4 0x90 0x80 0x80 would decode to U+110000 if unchecked.
  const r = decodeUtf8(bytes('f4 90 80 80'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('5-byte lead byte is rejected', () => {
  // 0xF8 begins a 5-byte sequence in the pre-RFC3629 scheme; modern UTF-8
  // caps at four bytes, so this is ill-formed.
  const r = decodeUtf8(bytes('f8 88 80 80 80'));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.offset, 0);
});

test('valid prefix is recoverable from the reported offset', () => {
  // Two good chars, then a lone continuation. The offset lets the caller
  // slice off exactly the valid prefix.
  const input = bytes('41 42 80');
  const r = decodeUtf8(input);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.offset, 2);
    assert.equal(input.slice(0, r.offset).length, 2);
  }
});

test('Uint8Array input works the same as a plain array', () => {
  const r = decodeUtf8(new Uint8Array(bytes('e2 82 ac')));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.codepoints, [0x20ac]);
});
