const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes a base64 string into raw bytes (no atob dependency, works on all RN runtimes). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_ALPHABET.indexOf(clean[i] ?? "A");
    const b = B64_ALPHABET.indexOf(clean[i + 1] ?? "A");
    const c = B64_ALPHABET.indexOf(clean[i + 2] ?? "A");
    const d = B64_ALPHABET.indexOf(clean[i + 3] ?? "A");
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (p < byteLen) bytes[p++] = (chunk >> 16) & 0xff;
    if (p < byteLen) bytes[p++] = (chunk >> 8) & 0xff;
    if (p < byteLen) bytes[p++] = chunk & 0xff;
  }
  return bytes;
}
