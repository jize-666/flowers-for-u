"""Rebuild the original paper texture, grain, and optional ambient loop.
Requires numpy, Pillow, and the ffmpeg executable. Not needed to run the site.
"""
from pathlib import Path
import subprocess
import wave
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(77)
texture_dir = ROOT / 'static' / 'textures'
noise = rng.normal(0, 1.7, (512, 512, 1))
base = np.array([239, 231, 216])[None, None, :]
fibers = rng.normal(0, .9, (512, 1, 1))
image = np.clip(base + noise + fibers, 0, 255).astype('uint8')
Image.fromarray(image).save(texture_dir / 'paper.webp', quality=91)
grain = np.clip(rng.normal(128, 43, (160, 160)), 0, 255).astype('uint8')
Image.fromarray(grain).save(texture_dir / 'grain.png')

sample_rate, seconds = 22050, 32
n = sample_rate * seconds
time = np.arange(n) / sample_rate
# Frequencies are integer multiples of 1/32 Hz, so each layer loops continuously.
left = np.zeros(n)
right = np.zeros(n)
for frequency, amplitude in [(130.8125, .035), (196, .023), (261.625, .024), (329.625, .015), (392, .011)]:
    envelope = .72 + .23 * np.sin(2 * np.pi * time / seconds + rng.uniform(0, 6))
    phase = rng.uniform(0, 2 * np.pi)
    left += amplitude * envelope * np.sin(2 * np.pi * frequency * time + phase)
    right += amplitude * envelope * np.sin(2 * np.pi * frequency * time + phase + .17)
# Low, cyclic wind made in the frequency domain, without recorded samples.
freq = np.fft.rfftfreq(n, 1 / sample_rate)
spectrum = (rng.normal(size=len(freq)) + 1j * rng.normal(size=len(freq)))
spectrum *= np.exp(-freq / 1200) / np.maximum(freq, 70) ** .7
wind = np.fft.irfft(spectrum, n)
wind = wind / max(np.std(wind), 1e-8) * .020
left += wind * (.75 + .20 * np.sin(2 * np.pi * time / seconds))
right += np.roll(wind, 700) * (.75 + .20 * np.sin(2 * np.pi * time / seconds + .5))
stereo = np.stack([left, right], axis=1)
pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
wav = ROOT / 'static' / 'audio' / 'night-garden.wav'
with wave.open(str(wav), 'wb') as output:
    output.setnchannels(2); output.setsampwidth(2); output.setframerate(sample_rate)
    output.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'libvorbis', '-q:a', '3', str(wav.with_suffix('.ogg'))], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'libmp3lame', '-q:a', '5', str(wav.with_suffix('.mp3'))], check=True)
wav.unlink()
print('Paper, grain, and a 32-second original ambient loop created.')
