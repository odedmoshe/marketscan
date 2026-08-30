/**
 * Maintenance scoring, shared across every marketplace.
 *
 * The question this answers is narrow on purpose: "is anyone still home?" It is
 * not a quality score and must never be presented as one. A beloved, finished,
 * two-hundred-line plugin that needed no changes in three years scores badly
 * here and deserves to be understood, not shamed — so the output always carries
 * the evidence that produced it, and the caller decides.
 *
 * Why maintenance and not quality: quality is subjective, contested, and already
 * covered by ratings. Abandonment is objective, checkable from public metadata,
 * and is the thing that actually breaks a site when a platform ships a change.
 * It is also the thing marketplaces conspicuously do not surface, because an
 * abandoned listing still converts.
 */

/** Months between an ISO-ish date string and now. Tolerant of marketplace formats. */
export function monthsSince(value) {
  if (!value) return null;
  // Seen in the wild: "2024-11-28", "2024-11-28 9:30am GMT", full ISO.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const then = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(then)) return null;
  // Clamped at zero. A same-day timestamp otherwise yields -0, and a listing
  // dated slightly ahead of us — timezone, clock skew, a marketplace stamping
  // releases in local time — would report negative months. "Updated in the
  // future" only ever means "updated now".
  return Math.max(0, Math.round((Date.now() - then) / 2629800000));
}

export const GRADES = {
  active: { label: 'ACTIVE', blurb: 'shipping normally' },
  slowing: { label: 'SLOWING', blurb: 'still alive, but the pace has dropped' },
  stale: { label: 'STALE', blurb: 'no release in over a year' },
  abandoned: { label: 'ABANDONED', blurb: 'no release in over two years' },
  gone: { label: 'DELISTED', blurb: 'no longer available in the marketplace' },
  unknown: { label: 'UNKNOWN', blurb: 'the marketplace did not publish enough to judge' },
};

/**
 * Grade from update recency alone. Thresholds are deliberately blunt and stated
 * in the output — a hidden weighted composite would be less useful and no more
 * accurate, and the reader needs to be able to disagree with the cutoff.
 */
export function grade({ months, delisted = false }) {
  if (delisted) return 'gone';
  if (months === null || months === undefined) return 'unknown';
  if (months >= 24) return 'abandoned';
  if (months >= 12) return 'stale';
  if (months >= 6) return 'slowing';
  return 'active';
}

/**
 * The signal worth paying attention to: a large installed base whose maintainer
 * has stopped. Neither half is interesting alone. An abandoned plugin nobody
 * uses is housekeeping; a popular plugin under active development is fine.
 */
export function exposure({ installs, months, delisted = false }) {
  const g = grade({ months, delisted });
  if (g !== 'abandoned' && g !== 'stale' && g !== 'gone') return null;
  if (!installs || installs < 1000) return null;
  return {
    grade: g,
    installs,
    months,
    // Plain-language, because the whole point is that a non-developer can act on it.
    note:
      g === 'gone'
        ? 'Removed from the marketplace while still installed. Replace it.'
        : `Roughly ${installs.toLocaleString()} installs depending on code last touched ${months} months ago.`,
  };
}

/** Compact one-line verdict used by the CLI and by the dataset build. */
export function verdict(record) {
  const months = record.months ?? monthsSince(record.lastUpdated);
  const g = grade({ months, delisted: record.delisted });
  return {
    grade: g,
    label: GRADES[g].label,
    blurb: GRADES[g].blurb,
    months,
    exposure: exposure({ installs: record.installs, months, delisted: record.delisted }),
  };
}
