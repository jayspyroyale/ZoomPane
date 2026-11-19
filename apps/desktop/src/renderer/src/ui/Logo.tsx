/** ZoomPane mark: a rounded pane with a zoom lens in its corner. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="zp-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a5c" />
          <stop offset="1" stopColor="#ff4d2e" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#zp-logo)" />
      <rect x="7" y="8" width="13" height="9" rx="2.2" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="21" cy="20.5" r="4.6" fill="#ff4d2e" stroke="#fff" strokeWidth="2.2" />
      <path d="M24.3 23.8 L26.8 26.3" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
