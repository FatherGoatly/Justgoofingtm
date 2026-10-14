/** Human-readable formatting helpers (pure functions). */

export function formatBytes(bytes) {
  if ( !Number.isFinite(bytes) || bytes < 0 ) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while ( v >= 1024 && i < units.length - 1 ) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if ( !Number.isFinite(seconds) || seconds < 0 ) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function formatDimensions(width, height) {
  if ( !Number.isFinite(width) || !Number.isFinite(height) ) return "";
  return `${width} × ${height}`;
}

/** Reduce an aspect ratio to a short label such as "16:9" or "1.78:1" when not a common ratio. */
export function formatAspect(width, height) {
  if ( !width || !height ) return "";
  const common = [[1, 1], [4, 3], [3, 4], [3, 2], [2, 3], [16, 9], [9, 16], [16, 10], [10, 16], [21, 9], [2, 1], [1, 2], [5, 4], [4, 5]];
  const ratio = width / height;
  for ( const [a, b] of common ) if ( Math.abs(ratio - a / b) < 0.01 ) return `${a}:${b}`;
  return `${ratio.toFixed(2)}:1`;
}

export function formatRelativeTime(timestamp, now=Date.now()) {
  if ( !Number.isFinite(timestamp) ) return "";
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60000);
  if ( minutes < 1 ) return "just now";
  if ( minutes < 60 ) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if ( hours < 24 ) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if ( days < 30 ) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function pluralize(n, singular, plural=`${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}
