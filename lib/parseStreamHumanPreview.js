/**
 * Read a complete JSON string starting at buffer[startIdx] (must be '"').
 * Returns { value, endIdx } or null if the string is not closed yet.
 */
function tryReadJsonStringValue(buffer, startIdx) {
  let i = startIdx;
  if (i >= buffer.length || buffer[i] !== '"') return null;
  i += 1;
  let out = '';
  while (i < buffer.length) {
    const c = buffer[i];
    if (c === '\\') {
      if (i + 1 >= buffer.length) return null;
      const n = buffer[i + 1];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === '"' || n === '\\' || n === '/') out += n;
      else if (n === 'u' && i + 5 < buffer.length) {
        const hex = buffer.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        out += n;
      } else {
        out += n;
      }
      i += 2;
      continue;
    }
    if (c === '"') {
      return { value: out, endIdx: i + 1 };
    }
    out += c;
    i += 1;
  }
  return null;
}

/**
 * Turn a streaming JSON buffer into readable text (summary + numbered titles).
 * Best-effort for partial JSON from curriculum extract; ignores incomplete trailing strings.
 */
export function buildHumanPreviewFromPartialJson(buffer) {
  if (buffer == null || typeof buffer !== 'string' || buffer.length === 0) {
    return '';
  }
  const titles = [];
  let summary = '';
  let i = 0;

  while (i < buffer.length) {
    const idxSummary = buffer.indexOf('"summary"', i);
    const idxTitle = buffer.indexOf('"title"', i);
    const candidates = [];
    if (idxSummary >= 0) {
      candidates.push({ idx: idxSummary, key: 'summary', keyLen: 9 });
    }
    if (idxTitle >= 0) {
      candidates.push({ idx: idxTitle, key: 'title', keyLen: 7 });
    }
    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.idx - b.idx);
    const { idx, key, keyLen } = candidates[0];
    let pos = idx + keyLen;
    while (pos < buffer.length && /\s/.test(buffer[pos])) pos += 1;
    if (buffer[pos] !== ':') {
      i = idx + 1;
      continue;
    }
    pos += 1;
    while (pos < buffer.length && /\s/.test(buffer[pos])) pos += 1;
    const parsed = tryReadJsonStringValue(buffer, pos);
    if (!parsed) {
      break;
    }
    const val = parsed.value.trim();
    if (key === 'summary' && val) {
      summary = val;
    } else if (key === 'title' && val.length > 0) {
      titles.push(val);
    }
    i = parsed.endIdx;
  }

  const out = [];
  if (summary) {
    out.push(summary, '');
  }
  titles.forEach((t, n) => {
    out.push(`${n + 1}. ${t}`);
  });
  return out.join('\n').trim();
}

/**
 * Live preview while /parse-text-stream is in flight.
 * The model streams JSON fragments → use {@link buildHumanPreviewFromPartialJson}.
 * The parallel-chunk path streams plain-text preview lines → show the buffer as-is.
 */
export function buildImportStreamPreviewDisplay(streamedBuffer) {
  if (streamedBuffer == null || typeof streamedBuffer !== 'string') {
    return '';
  }
  const leading = streamedBuffer.replace(/^\uFEFF/, '').trimStart();
  if (!leading) {
    return '';
  }
  if (leading.startsWith('{')) {
    return buildHumanPreviewFromPartialJson(streamedBuffer);
  }
  return streamedBuffer.trim();
}
