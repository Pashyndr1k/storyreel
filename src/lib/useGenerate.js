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

  // Sequentially processes `items`, building a request per item and applying
  // each result as it arrives, so partial progress survives an error mid-batch.
  const runBatch = async (items, makeSpec, onEach, onProgress) => {
    if (!settings.apiKey) {
      setError('NO_KEY');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (let i = 0; i < items.length; i++) {
        if (onProgress) onProgress(i + 1, items.length);
        const data = await generateJSON(settings, makeSpec(items[i], i));
        onEach(items[i], data, i);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      if (onProgress) onProgress(0, 0);
    }
  };

  return { busy, error, run, runBatch };
}
