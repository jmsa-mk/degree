import fs from 'node:fs';
// Original two-tone notification chime, mono 16-bit PCM, bundled for offline use.
const rate = 44100, seconds = 0.8, samples = Math.round(rate * seconds);
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  let value = 0;
  for (const [start, frequency] of [[0, 784], [0.3, 1046.5]]) {
    const age = t - start;
    if (age >= 0 && age < 0.45) {
      const envelope = Math.min(1, age / 0.012) * Math.exp(-age * 9) * Math.min(1, (0.45 - age) / 0.03);
      value += 0.48 * envelope * Math.sin(2 * Math.PI * frequency * age);
    }
  }
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
}
fs.writeFileSync('public/alert.wav', wav);
