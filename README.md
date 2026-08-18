# The Bell

The Bell turns estimated worldwide rates of violence against women into a field
of independently timed ripples and synthesised bells. The browser renders the
ripples in a single instanced WebGL draw and synthesises sound with a bounded
pool of persistent resonators, so even event streams with hundreds of
occurrences per second do not create hundreds of canvas or Web Audio objects.

The deployed project also contains an About page with source attribution,
methodological caveats, privacy information, and links to relevant charities.
Each legend row has an independent switch that immediately removes that event's
ripples, cancels queued strikes, and mutes both its dry bell and reverb tail.
The two murder streams are intentionally voiced as opposites: a ringing Tragic
tower bell for stranger murders and an old, rough Black iron bourdon for
partner murders.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm
- Linux for the bundled deployment verification scripts

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm test
npm run lint
npm run build
```

## Configure the visualisation

All artistic and statistical event settings live in
[`config/visualisation.json`](config/visualisation.json). The adjacent JSON
Schema supplies editor completion and catches malformed values. The application
also validates the configuration when it starts and fails loudly instead of
silently rendering nonsense.

Global fields:

| Field | Meaning |
| --- | --- |
| `backgroundColor` | Six-digit canvas and page background colour. |
| `masterVolume` | Final audio gain. `0` is silent; the current value is `0.82`. |
| `globalVariation.startTimeJitterMs` | Maximum random audio offset around the visual strike time. |
| `events` | Independent event streams. Add or remove objects here without changing TypeScript. |

Per-event fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable unique machine name using lowercase letters, digits, `_`, or `-`. |
| `name` | Human-readable label in the legend. |
| `frequencyPerMinute` | Mean number of events fired per minute. Fractional values are valid. |
| `jitter` | Maximum random interval variation as a fraction. `0.35` means each interval is varied independently within ±35%. |
| `ripple.color` | Six-digit ripple colour. |
| `ripple.shape` | One of the three built-in geometries: `normal`, `partial`, or `wavy`. |
| `ripple.maxSize` | Maximum radius in CSS pixels. Individual marks vary between 90% and 100% of it. |
| `ripple.fadeSeconds` | Complete visual lifetime, including fade-out. |
| `sound.voiceLabel` | Human-readable voice name in the legend. |
| `sound.primeHz` | Reference prime frequency used to describe the voice. |
| `sound.notePoolHz` | Possible prime frequencies selected independently for each strike. |
| `sound.attackMs` | Time over which a strike excites its resonators. |
| `sound.strikeNoise` | Strength of the short broadband impact transient. |
| `sound.strikeNoiseDecayMs` | Lifetime of the impact transient. |
| `sound.lowpassHz` / `highpassHz` | Per-voice tonal bandwidth. |
| `sound.reverbSend` | Reverb return level from `0` (dry) to `1`. |
| `sound.reverbTimeSec` | Length of the generated convolution tail. |
| `sound.predelayMs` | Delay before the reverb tail begins. |
| `sound.pan` | Stereo position from `-1` (left) to `1` (right). |
| `sound.stereoWidth` | Maximum per-strike spread around the base pan. |
| `sound.pitchJitterCents` | Small per-strike pitch drift in cents. |
| `sound.gainJitter` / `decayJitter` | Per-strike loudness and decay variation as fractions. |
| `sound.masterGain` | Gain for this event before the master limiter. |
| `sound.maxVoices` | Hard polyphony limit. Oldest voice slots are reused under dense load. |
| `sound.partials` | Named resonant modes that define the bell morphology. |

Each sound partial exposes:

| Field | Meaning |
| --- | --- |
| `name` | Descriptive mode name such as `hum`, `prime`, or `tierce`. |
| `ratio` | Frequency relative to the selected note-pool prime. |
| `gain` | Strength of the mode before event and master gain. |
| `decaySec` | Dry resonator decay before reverb. |
| `detuneCents` | Fixed micro-detuning for the mode. |

### Add an event

Copy an object in `events`, give it a unique `id`, and change its values. The
renderer builds its colour and geometry at runtime; the audio engine constructs
its resonators and reverb path from the same object; and the legend maps the
entry automatically.

Minimal example:

```json
{
  "id": "example-event",
  "name": "Example event",
  "frequencyPerMinute": 12,
  "jitter": 0.25,
  "ripple": {
    "color": "#D02040",
    "shape": "normal",
    "maxSize": 100,
    "fadeSeconds": 3
  },
  "sound": {
    "voiceLabel": "Small bronze bell",
    "primeHz": 440,
    "notePoolHz": [415.3, 440, 466.16],
    "attackMs": 8,
    "strikeNoise": 0.08,
    "strikeNoiseDecayMs": 35,
    "lowpassHz": 6000,
    "highpassHz": 80,
    "reverbSend": 0.25,
    "reverbTimeSec": 2.5,
    "predelayMs": 12,
    "stereoWidth": 0.3,
    "pan": 0,
    "pitchJitterCents": 5,
    "gainJitter": 0.1,
    "decayJitter": 0.08,
    "masterGain": 0.8,
    "maxVoices": 4,
    "partials": [
      { "name": "prime", "ratio": 1, "gain": 0.7, "decaySec": 2.2, "detuneCents": 0 },
      { "name": "upper", "ratio": 2.71, "gain": 0.2, "decaySec": 1.3, "detuneCents": 3 }
    ]
  }
}
```

Configuration changes are bundled at build time. Restart the development
server or rebuild the deployment after editing JSON.

## Architecture

- `app/page.tsx` — event scheduler, WebGL/Canvas rendering, audio routing, and legend.
- `config/visualisation.json` — editable runtime configuration.
- `lib/visualisation-config.ts` — types and defensive validation.
- `public/bell-processor.js` — constant-cost AudioWorklet resonator processor.
- `app/about/page.tsx` — project information, sources, privacy, and legal caveats.

The scheduler uses bounded uniform jitter around each event's base interval. It
does not use an unbounded Poisson delay: a Poisson process is statistically
plausible, but it makes a user-facing `jitter` limit impossible to honour.

## Deployment note

This checkout is configured for ChatGPT Sites and Cloudflare-compatible Vinext.
The `.openai/hosting.json` manifest identifies the existing deployment. If you
fork the repository for a different Site, create a new hosting identity instead
of reusing that manifest unchanged.

No licence has been granted yet. Add an explicit licence before inviting reuse
outside this repository.
