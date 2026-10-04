from pathlib import Path
import subprocess
import wave
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RATE = 24000
SECONDS = 64
SEED = 405


def build_paper():
    rng = np.random.default_rng(SEED)
    base = rng.normal(0, 1, (512, 512))
    fibers = gaussian_filter(base, sigma=(0.5, 3.0))
    cloud = gaussian_filter(rng.normal(0, 1, (512, 512)), 13)
    cloud = cloud / max(cloud.std(), 0.001)
    value = fibers * 3 + cloud * 0.8
    rgb = np.clip(np.array([234, 226, 209]) + value[..., None], 0, 255).astype(np.uint8)
    folder = ROOT / 'static/textures'
    Image.fromarray(rgb).save(folder / 'opening-paper.webp', quality=85)
    grain = np.clip(128 + rng.normal(0, 21, (128, 128)), 0, 255).astype(np.uint8)
    Image.fromarray(grain).save(folder / 'opening-grain.png')


def build_audio():
    rng = np.random.default_rng(SEED)
    length = RATE * SECONDS
    mix = np.zeros((length, 2), dtype=np.float64)
    chords = [
        [50, 57, 61, 64, 69], [45, 52, 57, 59, 64],
        [47, 54, 57, 62, 66], [43, 50, 54, 57, 62],
        [50, 57, 61, 64, 66], [54, 57, 61, 64, 69],
        [43, 50, 57, 59, 62], [45, 52, 57, 59, 64],
    ]

    def note(midi, start, duration, gain, pan=0.0, pad=False):
        count = int(duration * RATE)
        t = np.arange(count) / RATE
        hz = 440.0 * 2 ** ((midi - 69) / 12)
        if pad:
            envelope = np.sin(np.pi * np.clip(t / duration, 0, 1)) ** 2
            waveform = np.sin(2 * np.pi * hz * t) + 0.13 * np.sin(2 * np.pi * hz * 2 * t)
            waveform += 0.04 * np.sin(2 * np.pi * hz * 3 * t)
        else:
            envelope = (1 - np.exp(-t / 0.045)) * np.exp(-t / 1.8)
            envelope *= np.minimum(1, np.maximum(0, (duration - t) / 0.7))
            waveform = np.sin(2 * np.pi * hz * t)
            waveform += 0.19 * np.sin(2 * np.pi * hz * 2.003 * t) * np.exp(-t / 0.8)
            waveform += 0.05 * np.sin(2 * np.pi * hz * 3.001 * t) * np.exp(-t / 0.5)
        audio = gain * waveform * envelope
        indexes = (int(start * RATE) + np.arange(count)) % length
        mix[indexes, 0] += audio * np.sqrt((1 - pan) / 2)
        mix[indexes, 1] += audio * np.sqrt((1 + pan) / 2)

    for bar, chord in enumerate(chords):
        start = bar * 8
        for j, midi in enumerate(chord):
            note(midi - 12, start - 2 + j * .09, 12, .028, (j - 2) * .22, True)
        for j, beat in enumerate([.4, 2.7, 5.1, 6.6]):
            midi = chord[[2, 4, 3, 1][j]] + (12 if j == 1 else 0)
            note(midi, start + beat, 5.0, .041 if j < 3 else .024, rng.uniform(-.32, .32))

    dry = mix.copy()
    for seconds, level in [(0.17, .15), (.31, .12), (.57, .10), (.93, .075), (1.49, .052), (2.13, .03)]:
        mix += np.roll(dry[:, ::-1], int(seconds * RATE), axis=0) * level
    rms = np.sqrt(np.mean(mix * mix))
    mix *= 10 ** (-24 / 20) / max(rms, 1e-9)
    peak = np.max(np.abs(mix))
    if peak > .45:
        mix *= .45 / peak
    pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    folder = ROOT / 'static/audio'
    wav = folder / 'opening-warmth.wav'
    with wave.open(str(wav), 'wb') as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav),
                    '-codec:a', 'libmp3lame', '-b:a', '128k', str(folder / 'opening-warmth.mp3')], check=True)
    print(f'Audio: {SECONDS}s, {RATE}Hz stereo. Peak {np.max(np.abs(mix)):.4f}. RMS {20*np.log10(np.sqrt(np.mean(mix*mix))):.2f} dBFS.')


if __name__ == '__main__':
    build_paper()
    build_audio()
