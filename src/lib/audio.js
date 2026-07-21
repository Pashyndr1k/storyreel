// Audio helpers for the Stage-6 timeline: decode any browser-supported media
// (mp4/webm/mp3/wav data URLs) into an AudioBuffer, and pack an AudioBuffer
// into a WAV data URL so it can live as a clip on the audio timeline, play in
// the preview and feed ffmpeg.

const dataURLToArrayBuffer = (dataURL) => {
  const base64 = String(dataURL).split(',')[1] || '';
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
};

// Decode the audio track of a media data URL. Resolves null when the file has
// no decodable audio (e.g. a video with no audio stream).
export async function decodeMediaAudio(dataURL) {
  let ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(dataURLToArrayBuffer(dataURL));
    return buf && buf.duration > 0.01 ? buf : null;
  } catch {
    return null;
  } finally {
    try {
      ctx?.close();
    } catch {
      /* already closed */
    }
  }
}

// AudioBuffer → 16-bit PCM WAV data URL (keeps the buffer's channel count and
// sample rate; ffmpeg and <audio> both resample as needed).
export function audioBufferToWavDataURL(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels || 1);
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const dataLen = frames * channels * 2;
  const out = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(out);
  const wstr = (off, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  wstr(36, 'data');
  dv.setUint32(40, dataLen, true);
  const chans = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  // chunked base64 to avoid call-stack limits on long buffers
  const u8 = new Uint8Array(out);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}
