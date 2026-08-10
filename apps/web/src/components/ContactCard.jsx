import { useState } from 'react';
import { CheckIcon, CopyIcon, MailIcon } from './Icons';

const EMAIL = 'badhann.work@gmail.com';

// A prefilled subject keeps real feedback out of the spam pile and makes it
// filterable once there is more than a trickle of it.
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent('coDF — feedback')}`;

/**
 * Contact panel.
 *
 * A tool that invites suggestions should make replying trivial, so the address
 * is shown in full rather than hidden behind a "contact" link: some people will
 * mail from their phone, others will copy it into a client that is already
 * open, and both paths are one tap.
 */
export default function ContactCard() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(EMAIL);
    } catch {
      // Clipboard access is blocked on insecure origins and inside some in-app
      // browsers. Selecting the address is a workable fallback and beats a
      // button that appears to do nothing.
      const node = document.getElementById('contact-email');

      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="reveal panel panel-lit relative mt-12 overflow-hidden p-5 shadow-[var(--shadow-md)] sm:mt-16 sm:p-7">
      {/* A soft accent wash so the card reads as an invitation rather than
          another form panel. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full opacity-60 blur-3xl"
        style={{ background: 'var(--accent-soft)' }}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
            <MailIcon width={19} height={19} />
          </span>

          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight sm:text-lg">Ideas, bugs, or just saying hello</h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--ink-muted)]">
              Suggestions and feature requests are genuinely welcome — most of what this site does started as
              somebody asking for it.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 sm:items-end">
          <a
            id="contact-email"
            href={MAILTO}
            className="focus-ring inline-flex items-center gap-2 self-start break-all rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.7)] px-3.5 py-2 font-mono text-sm font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] sm:self-auto"
          >
            {EMAIL}
          </a>

          <div className="flex gap-2">
            <a href={MAILTO} className="btn-primary focus-ring">
              <MailIcon width={15} height={15} />
              Send an email
            </a>

            <button type="button" onClick={copy} className="btn-ghost focus-ring" aria-label="Copy email address">
              {copied ? <CheckIcon width={15} height={15} /> : <CopyIcon width={15} height={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
