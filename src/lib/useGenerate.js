import { useState } from 'react';
import { generateJSON } from './claude.js';

export function useGenerate(settings) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (spec, onResult) => {
    if (!settings.apiKey) {
      setError('NO_KEY');
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

  // Processes `items` with a small worker pool (results apply as they arrive, so
  // partial progress survives failures). Individual failures don't stop the rest;
  // the first error is surfaced at the end. generateJSON retries transient errors.
  const runBatch = async (items, makeSpec, onEach, onProgress, concurrency = 3) => {
    if (!settings.apiKey) {
      setError('NO_KEY');
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
          const data = await generateJSON(settings, makeSpec(items[i], i));
          onEach(items[i], data, i);
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

  return { busy, error, run, runBatch };
}
