# The Bell

The Bell turns estimated worldwide rates of violence against women into a field
of independently timed ripples and synthesised bells. The browser renders the
ripples in a single instanced WebGL draw and synthesises sound with persistent
resonators, so even event streams with hundreds of occurrences per second do
not create hundreds of canvas or Web Audio objects.

The deployed project also contains an About page with source attribution,
methodological caveats, privacy information, and links to relevant charities.
Each legend row has an independent switch that immediately removes that event's
ripples, cancels queued strikes, and mutes both its dry bell and reverb tail.
The two murder streams are intentionally voiced as opposites: a bright,
alarming temple-gong strike for stranger murders and a sustained low funeral
bourdon for partner murders.

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
| `sound.bellName` | Human-readable timbre name in the legend. |
| `sound.volume` | Gain for this event before the master limiter. |
| `sound.reverbSeconds` | Length of the generated convolution tail. |
| `sound.reverbWet` | Reverb return level from `0` (dry) to `1`. |
| `sound.pan` | Stereo position from `-1` (left) to `1` (right). |
| `sound.partials` | Resonant frequencies that make up the bell. |

Each sound partial exposes:

| Field | Meaning |
| --- | --- |
| `pitchHz` | Frequency of the resonator in hertz. Raising all pitches makes the bell higher. Non-integer ratios sound more bell-like than neat musical harmonics. |
| `amplitude` | Strength of that partial. Keep high-frequency partials quieter unless brutality is the point. |
| `decaySeconds` | Dry resonator decay before reverb. |

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
    "bellName": "Small bronze bell",
    "volume": 0.8,
    "reverbSeconds": 2.5,
    "reverbWet": 0.25,
    "pan": 0,
    "partials": [
      { "pitchHz": 640, "amplitude": 0.01, "decaySeconds": 2.2 },
      { "pitchHz": 1037, "amplitude": 0.004, "decaySeconds": 1.8 }
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
