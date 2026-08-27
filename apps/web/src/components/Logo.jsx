/**
 * Brand lockup: mark + wordmark.
 *
 * The mark is a page with a folded corner holding a pair of code chevrons —
 * the product's whole proposition (code becomes a document) in one shape that
 * still reads at 16px. Previously the header was just the typeface's default
 * letterforms, which meant nothing here was recognisable without the words.
 *
 * The wordmark keeps Space Grotesk rather than faking custom lettering with
 * hand-drawn paths: the typeface is distinctive already, and badly-drawn
 * letters would look worse than well-set ones. The craft goes into the lockup
 * — weight contrast, optical spacing, and a hairline rule before the byline.
 */

export function LogoMark({ size = 40, animated = false, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="coDF"
    >
      <defs>
        {/* Fixed brand colours, not theme tokens: a mark that changes hue
            between light and dark is two marks. Amber into crimson — the two
            ends of the palette's hot axis, so the mark is a swatch of the
            system it sits in. These match the favicon so the tab icon and the
            header are the same object. */}
        <linearGradient id="codf-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb43a" />
          <stop offset="100%" stopColor="#d92544" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="13" fill="url(#codf-mark)" />

      {/* Page body */}
      <path
        d="M15 12.5h10.5L34 21v14.5a2.5 2.5 0 0 1-2.5 2.5h-16a2.5 2.5 0 0 1-2.5-2.5V15a2.5 2.5 0 0 1 2.5-2.5z"
        fill="#fff"
        fillOpacity="0.96"
      />
      {/* Folded corner */}
      <path d="M25.5 12.5 34 21h-6.5a2 2 0 0 1-2-2v-6.5z" fill="#fff" fillOpacity="0.55" />

      {/* Code chevrons */}
      <g
        stroke="#d92544"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className={animated ? 'mark-chevrons' : undefined}
      >
        <path d="M21.5 25.5 18 29l3.5 3.5" />
        <path d="M26.5 25.5 30 29l-3.5 3.5" />
      </g>
    </svg>
  );
}

export default function Logo() {
  return (
    <div className="flex items-center gap-3.5 sm:gap-4">
      <LogoMark size={52} animated className="shrink-0 drop-shadow-[0_6px_16px_rgba(0,0,0,0.18)] sm:h-[60px] sm:w-[60px]" />

      <div className="min-w-0">
        <h1 className="display text-[clamp(2.4rem,7vw,3.6rem)]">
          {/* Weight contrast inside one word is the lockup's signature: light
              "co", heavy "DF" — the file format the product is named for. */}
          <span className="gradient-text font-medium">co</span>
          <span className="gradient-text font-bold">DF</span>
        </h1>

        <div className="mt-1 flex items-center gap-2.5">
          <span className="h-px w-6 bg-[var(--line-strong)]" />
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-[var(--ink-faint)]">
            by Badhan
          </span>
        </div>
      </div>
    </div>
  );
}
