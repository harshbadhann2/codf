import { ArrowIcon, ShieldIcon } from './Icons';

/**
 * The code → PDF transformation, drawn.
 *
 * The old landing view showed a form and nothing else, so a first-time visitor
 * had to upload something before learning what the tool produced. This is the
 * proof: a miniature source file on the left, the rendered page on the right,
 * built from divs rather than a screenshot so it stays sharp, themes with the
 * rest of the app, and costs no image download.
 */

const CODE_LINES = [
  [{ w: 22, c: 'kw' }, { w: 30, c: 'fn' }, { w: 12, c: 'pl' }],
  [{ w: 14, c: 'pl' }, { w: 34, c: 'str' }],
  [{ w: 18, c: 'kw' }, { w: 24, c: 'pl' }, { w: 16, c: 'num' }],
  [{ w: 40, c: 'cm' }],
  [{ w: 20, c: 'kw' }, { w: 28, c: 'fn' }],
  [{ w: 16, c: 'pl' }, { w: 22, c: 'str' }, { w: 10, c: 'pl' }]
];

const TOKEN_COLOUR = {
  kw: 'bg-fuchsia-400/70',
  fn: 'bg-sky-400/70',
  str: 'bg-emerald-400/70',
  num: 'bg-amber-400/70',
  cm: 'bg-slate-400/40',
  pl: 'bg-slate-400/60'
};

function CodeCard() {
  return (
    <div className="panel panel-lit relative w-[46%] max-w-[230px] overflow-hidden p-3 shadow-[var(--shadow-md)]">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <span className="ml-1 font-mono text-[9px] text-[var(--ink-faint)]">main.py</span>
      </div>

      <div className="space-y-[7px]">
        {CODE_LINES.map((line, row) => (
          <div
            key={row}
            className="flex items-center gap-1.5"
            style={{ animation: `rise .5s var(--ease-out) both`, animationDelay: `${0.35 + row * 0.07}s` }}
          >
            <span className="w-2 shrink-0 text-right font-mono text-[8px] leading-none text-[var(--ink-faint)]">
              {row + 1}
            </span>
            {line.map((token, index) => (
              <span
                key={index}
                className={`h-[5px] rounded-full ${TOKEN_COLOUR[token.c]}`}
                style={{ width: `${token.w}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageCard() {
  return (
    <div
      className="panel panel-lit relative w-[46%] max-w-[230px] overflow-hidden bg-white/90 p-3 shadow-[var(--shadow-md)] dark:bg-slate-100/95"
      style={{ animation: 'pop .6s var(--ease-spring) both', animationDelay: '0.75s' }}
    >
      <div className="sheen" />

      <div className="mb-2 space-y-1">
        <div className="h-[7px] w-[62%] rounded-full bg-slate-800/80" />
        <div className="h-[4px] w-[40%] rounded-full bg-slate-400/70" />
      </div>

      <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-900/10">
        <div className="space-y-[6px]">
          {CODE_LINES.map((line, row) => (
            <div key={row} className="flex items-center gap-1.5">
              <span className="w-2 shrink-0 text-right font-mono text-[7px] leading-none text-slate-400">
                {row + 1}
              </span>
              {line.map((token, index) => (
                <span
                  key={index}
                  className={`h-[4px] rounded-full ${TOKEN_COLOUR[token.c]}`}
                  style={{
                    width: `${token.w}%`,
                    animation: 'fade .4s ease-out both',
                    animationDelay: `${0.95 + row * 0.05}s`
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="h-[3px] w-[26%] rounded-full bg-slate-300" />
        <div className="h-[3px] w-[14%] rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <div>
      <div className="relative flex items-center justify-center gap-3 sm:gap-4">
        <CodeCard />

        <div
          className="flex shrink-0 flex-col items-center"
          style={{ animation: 'pop .5s var(--ease-spring) both', animationDelay: '0.6s' }}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
            <ArrowIcon width={16} height={16} />
          </span>
        </div>

        <PageCard />
      </div>

      {/* Naming the two ends turns a decoration into an explanation. The long
          form wraps to two lines on a phone, so it shortens there. */}
      <div className="mt-2.5 flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)] sm:gap-4">
        <span className="w-[46%] max-w-[230px] text-center">Your code</span>
        <span className="w-9" />
        <span className="w-[46%] max-w-[230px] text-center text-[var(--accent)]">
          <span className="sm:hidden">Ready to submit</span>
          <span className="hidden sm:inline">Submission-ready PDF</span>
        </span>
      </div>
    </div>
  );
}

export function TrustChips() {
  const items = ['No sign-up', 'Auto-deleted', 'Free forever'];

  return (
    <div className="flex flex-wrap gap-2">
      <span className="chip">
        <ShieldIcon width={13} height={13} className="text-[var(--accent)]" />
        Private by default
      </span>
      {items.map((item) => (
        <span key={item} className="chip">
          {item}
        </span>
      ))}
    </div>
  );
}
