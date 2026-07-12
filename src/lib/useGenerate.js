import { useState } from 'react';
import { generateJSON, textKeyError } from './claude.js';

export function useGenerate(settings) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (spec, onResult) => {
    const keyErr = textKeyError(settings);
    if (keyErr) {
      setError(keyErr);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await generateJSON(settings, spec);
      onResult(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Runs several specs sequentially as one busy operation (e.g. Stage 5's
  // image-prompt call followed by its video-prompt call). Results apply as they
  // arrive so a failure mid-way keeps the earlier results.
  const runMany = async (specs, onResult) => {
    const keyErr = textKeyError(settings);
    if (keyErr) {
      setError(keyErr);
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (let i = 0; i < specs.length; i++) {
        const data = await generateJSON(settings, specs[i]);
        onResult(data, i);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Processes `items` with a small worker pool (results apply as they arrive, so
  // partial progress survives failures). Individual failures don't stop the rest;
  // the first error is surfaced at the end. generateJSON retries transient errors.
  // makeSpec may return a single spec or an array of specs; an array runs
  // sequentially for that item (onEach fires per result, progress once per item).
  const runBatch = async (items, makeSpec, onEach, onProgress, concurrency = 3) => {
    const keyErr = textKeyError(settings);
    if (keyErr) {
      setError(keyErr);
      return;
    }
    setBusy(true);
    setError('');
    const errors = [];
    let nextIdx = 0;
    let done = 0;
    if (onProgress) onProgress(0, items.length);
    const worker = async () => {
      for (;;) {
        const i = nextIdx++;
        if (i >= items.length) return;
        try {
          const spec = makeSpec(items[i], i);
          const specs = Array.isArray(spec) ? spec : [spec];
          for (const s of specs) {
            const data = await generateJSON(settings, s);
            onEach(items[i], data, i);
          }
        } catch (e) {
          errors.push(e);
        }
        done++;
        if (onProgress) onProgress(done, items.length);
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker)
      );
    } finally {
      setBusy(false);
      if (onProgress) onProgress(0, 0);
      if (errors.length) setError(errors[0].message || String(errors[0]));
    }
  };

  return { busy, error, run, runMany, runBatch };
}
