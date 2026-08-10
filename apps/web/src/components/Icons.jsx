/**
 * Inline SVG icons.
 *
 * Bundled rather than pulled from an icon package: the app needs eight of
 * them, and shipping a dependency for that would cost more than the markup.
 */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
};

export function CodeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m8 6-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16" />
    </svg>
  );
}

export function MarkdownIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M6 15.5v-7l3 3.5 3-3.5v7" />
      <path d="M16 8.5v7m0 0 2.2-2.4M16 15.5l-2.2-2.4" />
    </svg>
  );
}

export function DocIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14 3v5h5" />
      <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export function ImageIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17M15 14l1.5-1.5a2 2 0 0 1 2.8 0L20 13.5" />
    </svg>
  );
}

export function ResizeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 15v4a1 1 0 0 1-1 1h-4" />
      <rect x="8" y="8" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function TextScanIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" />
      <path d="M7.5 9.5h9M7.5 12.5h9M7.5 15.5h5" />
    </svg>
  );
}

export function UploadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </svg>
  );
}

export function SunIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/** Two-way arrow, for conversions that run in both directions. */
export function SwapIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9h16m0 0-4-4m4 4-4 4M20 15H4m0 0 4-4m-4 4 4 4" />
    </svg>
  );
}

export function ArrowIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h16m0 0-6-6m6 6-6 6" />
    </svg>
  );
}
