"""Musique originale du film « Vos données restent chez vous » (aucune licence à gérer).

Générée par code : nappes douces, basse, arpège qui arrive quand l'IA « vient chez vous »,
puis un battement discret. La structure suit les scènes du film (voir index.html) :

    0   - 5     ouverture, nappe seule
    5   - 12.5  le problème : accord mineur, un peu de tension
    12.5 - 22   la solution : l'harmonie s'ouvre, l'arpège entre
    22  - 34.5  les quatre engagements : pulsation régulière
    34.5 - 44   fermeture : accord résolu, fondu de sortie

Sortie : assets/music-generated.mp3 (gardée à côté, non utilisée dans le film) (stéréo, 44,1 kHz). Demande numpy et ffmpeg.
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 44.0
OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(7)  # graine fixe : le rendu est toujours le même

t = np.arange(int(SR * DUR)) / SR
L = np.zeros_like(t)
R = np.zeros_like(t)


def hz(note):
    """Fréquence d'une note MIDI."""
    return 440.0 * 2 ** ((note - 69) / 12)


def smooth(x, a, b, rise=0.8, fall=1.2):
    """Enveloppe douce : monte sur `rise` s depuis a, redescend sur `fall` s avant b."""
    up = np.clip((t - a) / rise, 0, 1)
    dn = np.clip((b - t) / fall, 0, 1)
    return x * (up * up * (3 - 2 * up)) * (dn * dn * (3 - 2 * dn))


def pad(freqs, a, b, gain, pan=0.0, bright=5):
    """Nappe : quelques sinus désaccordés et leurs harmoniques, avec un lent tremblement."""
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ph = rng.uniform(0, 2 * np.pi)
            for h in range(1, bright + 1):
                out += np.sin(2 * np.pi * f * (1 + det / 100) * h * t + ph) / (h ** 1.6)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6))
    return smooth(out * lfo, a, b, rise=1.6, fall=1.8) * gain


def add(sig, pan=0.0):
    global L, R
    L += sig * (1 - max(pan, 0))
    R += sig * (1 + min(pan, 0))


# (début, fin, accord de nappe en notes MIDI, basse)
A2, F2, C3, G2 = 45, 41, 48, 43
chords = [
    (0.0, 5.4, [57, 60, 64], A2),
    (5.0, 10.8, [57, 60, 64, 67], A2),       # Am7 : un peu de tension
    (10.4, 16.2, [53, 57, 60, 64], F2),      # Fmaj7 : l'harmonie s'ouvre
    (15.8, 21.6, [55, 59, 62, 67], G2 + 0),
    (21.2, 27.0, [57, 60, 64, 67], A2),
    (26.6, 32.4, [53, 57, 60, 64], F2),
    (32.0, 44.0, [48, 55, 60, 64, 67], C3),  # Cadd9 : résolu
]
for a, b, notes, bass in chords:
    for i, n in enumerate(notes):
        add(pad([hz(n)], a, b, 0.055, pan=(-0.35 + 0.7 * i / max(1, len(notes) - 1))), pan=0)
    low = np.sin(2 * np.pi * hz(bass) * t) + 0.35 * np.sin(2 * np.pi * hz(bass + 12) * t)
    add(smooth(low, a, b, rise=1.2, fall=1.5) * 0.16)

# Un souffle de bruit filtré dans l'ouverture et la fermeture (texture d'air)
noise = rng.standard_normal(len(t))
spec = np.fft.rfft(noise)
freq = np.fft.rfftfreq(len(t), 1 / SR)
spec *= np.exp(-((freq - 1800) / 1400) ** 2)
air = np.fft.irfft(spec, len(t))
air /= np.max(np.abs(air))
add(smooth(air, 0, 6, rise=2.5, fall=2.5) * 0.02 + smooth(air, 34, 44, rise=2.5, fall=5) * 0.02)


def pluck(note, start, gain, pan):
    """Note pincée : sinus + octave, enveloppe qui retombe vite."""
    n = int(SR * 1.8)
    s = int(start * SR)
    if s >= len(t):
        return
    n = min(n, len(t) - s)
    tt = np.arange(n) / SR
    f = hz(note)
    env = np.exp(-tt * 3.4) * np.minimum(1, tt / 0.004)
    sig = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.12 * np.sin(2 * np.pi * 3 * f * tt)) * env
    sl = slice(s, s + n)
    L[sl] += sig * gain * (1 - max(pan, 0))
    R[sl] += sig * gain * (1 + min(pan, 0))


# Arpège : entre quand l'IA arrive (12,5 s), rythme sur 90 battements/minute
beat = 60 / 90
tones = {
    (10.4, 16.2): [65, 69, 72, 76],
    (15.8, 21.6): [67, 71, 74, 79],
    (21.2, 27.0): [69, 72, 76, 79],
    (26.6, 32.4): [65, 69, 72, 76],
    (32.0, 40.0): [72, 76, 79, 84],
}
k = 0
x = 12.5
while x < 41.5:
    for (a, b), ns in tones.items():
        if a <= x < b:
            n = ns[[0, 2, 1, 3, 2, 1][k % 6]]
            ramp = min(1, (x - 12.5) / 4.0) * min(1, (42 - x) / 5.0)
            pluck(n, x, 0.085 * ramp, pan=-0.4 if k % 2 else 0.4)
            break
    x += beat / 2
    k += 1

# Battement discret pendant les engagements (22 à 34,5 s)
b = 22.0
while b < 34.5:
    s = int(b * SR)
    n = int(SR * 0.28)
    tt = np.arange(n) / SR
    f = 58 * np.exp(-tt * 9) + 38
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 11)
    L[s:s + n] += thump * 0.14
    R[s:s + n] += thump * 0.14
    b += beat * 2

# Réverbération : réponse impulsionnelle de bruit qui s'éteint (convolution par FFT)
def reverb(x, secs=2.6, wet=0.32):
    n = int(SR * secs)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 2.4)
    ir[0] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - wet) + y * wet * 0.08

L = reverb(L)
R = reverb(R)

# Fondus d'entrée et de sortie, normalisation douce
fade_in = np.clip(t / 1.5, 0, 1)
fade_out = np.clip((DUR - t) / 3.5, 0, 1)
env = (fade_in ** 2) * (fade_out ** 2)
L *= env
R *= env
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
gain = 0.7 / peak
stereo = np.stack([L * gain, R * gain], axis=1)
pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2")

wav = OUT / "music.wav"
with wave.open(str(wav), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
mp3 = OUT / "music-generated.mp3"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3)], check=True)
wav.unlink()
print("musique :", mp3, f"{mp3.stat().st_size / 1024:.0f} Ko")
