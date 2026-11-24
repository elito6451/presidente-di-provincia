// Formattazione numeri, valute, tempi e codifica Base64 UTF-8

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];

export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value) || value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1000) {
    if (abs < 10 && !Number.isInteger(abs)) {
      return sign + abs.toFixed(1).replace('.', ',');
    }
    return sign + Math.floor(abs).toString();
  }

  const tier = Math.min(
    SUFFIXES.length - 1,
    Math.floor(Math.log10(abs) / 3)
  );
  const scaled = abs / Math.pow(1000, tier);
  const formatted = scaled >= 100
    ? scaled.toFixed(0)
    : scaled >= 10
      ? scaled.toFixed(1)
      : scaled.toFixed(decimals);

  return sign + formatted.replace('.', ',') + SUFFIXES[tier];
}

export function formatMoney(value) {
  return `€${formatNumber(value)}`;
}

export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function encodeBase64UTF8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64UTF8(base64) {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
