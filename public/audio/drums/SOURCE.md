# Drum samples — PLACEHOLDERS

These four WAVs are **synthesized**, not recorded. They were generated
programmatically so that Dhol Bator's lookahead scheduler and asynchrony
measurement could be built and verified against real decodable audio rather than
against nothing.

They are close enough in register and envelope to behave correctly for timing —
sharp transient, fast decay, unambiguous onset — and they are not a dhol. Replace
them.

| File | Stands in for | Register |
|---|---|---|
| `dhol-low.wav`  | dagga, the bass side of the dhol | ~70-170 Hz, pitch-dropping |
| `dhol-high.wav` | thili, the treble side            | ~300-420 Hz, short |
| `gogona.wav`    | gogona (jaw harp)                 | 196 Hz drone with a moving formant |
| `pepa.wav`      | pepa (buffalo-horn reed)          | 330 Hz, odd harmonics |

**Owner 3** replaces these with CC0 or team-recorded samples per `memory.md`.
Licence and source must be recorded here in the same commit as the audio, the
same rule `media_assets.licence` enforces for images.

Because these are synthesized from scratch there is no third-party licence
attached to them, so committing them carries no attribution risk.

Timing requirement for any replacement: a sharp, unambiguous onset within the
first few milliseconds of the file. A sample with a slow fade-in moves the
perceived beat away from the scheduled one and inflates every asynchrony.
