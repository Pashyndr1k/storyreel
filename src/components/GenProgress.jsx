import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { etaPercent } from '../lib/videoEta.js';

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// Progress shown INSIDE a generate button while its job runs: a fill bar
// behind the label and "NN% · m:ss". The percentage is an estimate from how
// long earlier generations took (see lib/videoEta.js) — the generation
// backends report no step progress — while the clock is the real elapsed
// time. Ticks on its own so the big workbench does not re-render every second.
export default function GenProgress({ startedAt, expectedSec }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const pct = etaPercent(elapsed, expectedSec);
  return (
    <>
      <span className="gen-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span
        className="gen-label"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        title={t('vid.progressTip', { e: clock(elapsed), x: clock(expectedSec) })}
      >
        {pct}% · {clock(elapsed)}
      </span>
    </>
  );
}
