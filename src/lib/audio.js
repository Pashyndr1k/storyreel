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

// Duration in seconds of any decodable media data URL (0 when undecodable).
export async function mediaDuration(dataURL) {
  const buf = await decodeMediaAudio(dataURL);
  return buf ? buf.duration : 0;
}

// Rebuild a recording with silence padded before and/or after it. Used by
// Stage 5 to control a voice clip's timing: the padded file becomes the audio
// that drives the talking-video (si2v) generation, so lead/tail silence shows
// up as held frames before and after the speech.
export async function padAudioWithSilence(dataURL, leadSec = 0, tailSec = 0) {
  const src = await decodeMediaAudio(dataURL);
  if (!src) throw new Error('AUDIO_UNDECODABLE');
  const lead = Math.max(0, Number(leadSec) || 0);
  const tail = Math.max(0, Number(tailSec) || 0);
  if (lead < 0.005 && tail < 0.005) return audioBufferToWavDataURL(src);

  const rate = src.sampleRate;
  const channels = Math.min(2, src.numberOfChannels || 1);
  const leadFrames = Math.round(lead * rate);
  const tailFrames = Math.round(tail * rate);
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const out = new Ctor(channels, leadFrames + src.length + tailFrames, rate);
  const buf = out.createBuffer(channels, leadFrames + src.length + tailFrames, rate);
  for (let c = 0; c < channels; c++) {
    const dst = buf.getChannelData(c);
    const s = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    dst.set(s, leadFrames); // frames outside the copy stay zero = silence
  }
  return audioBufferToWavDataURL(buf);
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
