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

  return { busy, error, run };
}
