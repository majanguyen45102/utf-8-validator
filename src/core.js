/**
 * UTF-8 validating decoder.
 *
 * WHY NOT TextDecoder: the platform TextDecoder('utf-8') is lenient. It silently
 * replaces ill-formed sequences with U+FFFD (or, with fatal:true, throws without
 * telling you WHERE the error is). This module validates byte-by-byte so callers
 * get either the exact code points or a precise byte offset, and so overlong
 * encodings and lone surrogates are rejected outright rather than papered over.
 *
 * Design decisions (stated plainly, per project policy):
 *  - The return type is a discriminated union: {ok:true, codepoints:...} on
 *    success, {ok:false, offset:...} on failure. We do NOT throw. Callers that
 *    want exceptions can wrap the result.
 *  - The offset reported on failure is the byte index in the input where the
 *    ill-formed sequence BEGAN, not the first byte after it. This is the index
 *    you'd slice up to in order to keep the good prefix.
 *  - We reject overlong encodings (e.g. 0xC0 0x80 must NOT decode to U+0000).
 *  - We reject surrogates: code points in [0xD800, 0xDFFF] are not produced,
 *    because a UTF-8 byte sequence must not carry lone UTF-16 surrogate halves.
 *    Surrogate PAIRS as such are not a UTF-8 concept; the brief's wording about
 *    "invalid surrogate pairs" is read as "no surrogate code points at all".
 *  - We reject truncated sequences: a leading byte that promises N continuation
 *    bytes but hits end-of-input (or a non-continuation byte) is an error.
 *  - We reject code points above U+10FFFF (the UTF-8 spec caps at four bytes).
 */

/**
 * @typedef {Object} DecodeSuccess
 * @property {true} ok
 * @property {number[]} codepoints  Array of Unicode code points (integers in
 *   [0, 0x10FFFF], excluding surrogates). One entry per decoded character.
 */

/**
 * @typedef {Object} DecodeFailure
 * @property {false} ok
 * @property {number} offset  Byte index in the input where the ill-formed
 *   sequence began. Slice the input at this index to recover the valid prefix.
 */

/**
 * @param {Uint8Array|number[]} bytes
 * @returns {DecodeSuccess | DecodeFailure}
 */
export function decodeUtf8(bytes) {
  // Accept plain arrays by normalizing to indexed access with a known length.
  // We avoid constructing a Uint8Array copy to keep zero allocations on the
  // hot path; we only read, never write.
  const len = bytes.length;

  const codepoints = [];
  let i = 0;

  while (i < len) {
    const b0 = bytes[i];

    // --- 1-byte sequence: 0xxxxxxx (U+0000..U+007F) ---
    if (b0 < 0x80) {
      codepoints.push(b0);
      i += 1;
      continue;
    }

    // Lead bytes 0x80..0xBF are stray continuations with no leader. Invalid.
    if (b0 < 0xC0) {
      return { ok: false, offset: i };
    }

    // From here we have a multi-byte sequence. Pull the lead byte's expected
    // length and initial payload bits, then read continuations.
    let cp;
    let need;

    if (b0 < 0xE0) {
      // 110xxxxx: 2-byte, 5 payload bits, range U+0080..U+07FF.
      cp = b0 & 0x1f;
      need = 1;
    } else if (b0 < 0xf0) {
      // 1110xxxx: 3-byte, 4 payload bits, range U+0800..U+FFFF (excl. surrogates).
      cp = b0 & 0x0f;
      need = 2;
    } else if (b0 < 0xf8) {
      // 11110xxx: 4-byte, 3 payload bits, range U+10000..U+10FFFF.
      cp = b0 & 0x07;
      need = 3;
    } else {
      // 0xF8..0xFF can never be a UTF-8 lead byte (spec caps at four bytes).
      return { ok: false, offset: i };
    }

    // Read exactly `need` continuation bytes of the form 10xxxxxx.
    // Hitting end-of-input or a non-continuation byte is a truncation error,
    // and the error points at the LEAD byte where the broken sequence started.
    let j = 1;
    for (; j <= need; j++) {
      if (i + j >= len) {
        return { ok: false, offset: i };
      }
      const c = bytes[i + j];
      if ((c & 0xc0) !== 0x80) {
        return { ok: false, offset: i };
      }
      cp = (cp << 6) | (c & 0x3f);
    }

    // Overlong check: the decoded value must be >= the smallest code point
    // that legitimately needs `need+1` bytes. If not, the encoder used more
    // bytes than required, which we reject to prevent 0xC0 0x80 -> U+0000 and
    // the whole class of overlong obfuscation attacks.
    let minCp;
    if (need === 1) minCp = 0x80;
    else if (need === 2) minCp = 0x800;
    else minCp = 0x10000;
    if (cp < minCp) {
      return { ok: false, offset: i };
    }

    // Surrogate rejection: code points in the surrogate block are reserved
    // for UTF-16 and must not appear in UTF-8. A well-formed 3-byte sequence
    // that decodes to e.g. U+D800 is therefore rejected here.
    if (cp >= 0xd800 && cp <= 0xdfff) {
      return { ok: false, offset: i };
    }

    // Final ceiling: the Unicode range ends at U+10FFFF. A 4-byte lead can
    // theoretically encode up to U+1FFFFF; reject anything above the plane.
    if (cp > 0x10ffff) {
      return { ok: false, offset: i };
    }

    codepoints.push(cp);
    i += 1 + need;
  }

  return { ok: true, codepoints };
}
