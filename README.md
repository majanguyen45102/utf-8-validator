# UTF-8 Validator

A small, zero-dependency validating UTF-8 decoder for JavaScript. Returns the
decoded code points on success, or the byte offset of the first ill-formed
sequence on failure. It rejects overlong encodings, lone surrogates, truncated
sequences, and code points above U+10FFFF.

## Usage

```js
import { decodeUtf8 } from './src/index.js';

const r = decodeUtf8([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
if (r.ok) {
  // r.codepoints -> [0x48, 0x65, 0x6c, 0x6c, 0x6f]
} else {
  // r.offset -> byte index where the bad sequence began
}
```

The function accepts any array-like of byte values (`number[]` or `Uint8Array`)
and returns a discriminated union: `{ ok: true, codepoints: number[] }` or
`{ ok: false, offset: number }`. It does not throw on malformed input.

## Why this exists

The platform `TextDecoder('utf-8')` is lenient by default — it replaces bad
bytes with U+FFFD — and even in `fatal` mode it only signals that something
was wrong, not where. When you need to validate untrusted byte streams and
report the precise failure location (for resumable parsing, protocol framing,
or security auditing where overlong encodings are an attack vector), you want a
strict decoder that never silently rewrites the input. The trade-off: this
library returns code points as numbers rather than a `string`, because
building a string from raw code points would reintroduce the platform's own
UTF-16 handling. Callers who want a string can `String.fromCodePoint(...r.codepoints)`.

## Edge cases you will hit

- The `offset` on failure is the index of the lead byte of the bad sequence,
  not the byte after it. Slice the input at `r.offset` to recover the valid
  prefix.
- "Invalid surrogate pairs" in the brief is read here as "no surrogate code
  points at all." UTF-8 has no concept of a surrogate pair; the UTF-16
  surrogate block [U+D800, U+DFFF] is simply forbidden in UTF-8, and a
  well-formed 3-byte sequence decoding to that block is rejected.
- A 5- or 6-byte lead byte (0xF8..0xFD) is rejected outright. RFC 3629 caps
  UTF-8 at four bytes; the earlier scheme that allowed longer sequences is not
  accepted here.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

