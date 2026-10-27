import fs from 'node:fs';

export function generateSyntheticWav(filePath, durationSec = 6) {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = sampleRate * durationSec;
  const dataSize = totalSamples * numChannels * bytesPerSample;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate pattern:
  // 0.0s - 1.5s: 440 Hz Sine wave (Audio)
  // 1.5s - 3.5s: 0 amplitude (2.0s of silence!)
  // 3.5s - 5.0s: 440 Hz Sine wave (Audio)
  // 5.0s - 6.0s: 0 amplitude (1.0s of silence!)
  const freq = 440;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    if ((t >= 0 && t < 1.5) || (t >= 3.5 && t < 5.0)) {
      sample = Math.sin(2 * Math.PI * freq * t) * 0.7 * 32767;
    }
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
  console.log(`Generated synthetic WAV (${durationSec}s): ${filePath} (${buffer.length} bytes)`);
  return buffer;
}

if (process.argv[1]?.endsWith('generate-test-wav.mjs')) {
  generateSyntheticWav('extension/tests/synthetic-audio.wav');
}
