/**
 * Exportación real de audio: WAV PCM 16-bit y MP3 (lamejs, carga diferida).
 */

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeText = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  const data: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) data.push(buffer.getChannelData(channel));

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data[channel]![frame]!));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

export async function audioBufferToMp3(buffer: AudioBuffer, kbps = 192): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);
  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels > 1 ? floatToInt16(buffer.getChannelData(1)) : null;
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < left.length; start += blockSize) {
    const end = Math.min(left.length, start + blockSize);
    const leftChunk = left.subarray(start, end);
    const encoded = right
      ? encoder.encodeBuffer(leftChunk, right.subarray(start, end))
      : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const flush = encoder.flush();
  if (flush.length > 0) chunks.push(new Uint8Array(flush));
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]!));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
