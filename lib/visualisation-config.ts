import rawConfig from "@/config/visualisation.json";

export type RippleShape = "normal" | "partial" | "wavy";
export type Rgb = [red: number, green: number, blue: number];

export type BellPartial = {
  name: string;
  ratio: number;
  gain: number;
  decaySec: number;
  detuneCents: number;
};

export type VisualisationEvent = {
  id: string;
  name: string;
  frequencyPerMinute: number;
  jitter: number;
  ripple: {
    color: string;
    shape: RippleShape;
    maxSize: number;
    fadeSeconds: number;
  };
  sound: {
    voiceLabel: string;
    primeHz: number;
    notePoolHz: number[];
    attackMs: number;
    strikeNoise: number;
    strikeNoiseDecayMs: number;
    lowpassHz: number;
    highpassHz: number;
    reverbSend: number;
    reverbTimeSec: number;
    predelayMs: number;
    spatialAmount: number;
    stereoWidth: number;
    pan: number;
    pitchJitterCents: number;
    gainJitter: number;
    decayJitter: number;
    masterGain: number;
    maxVoices: number;
    partials: BellPartial[];
  };
};

export type VisualisationConfig = {
  backgroundColor: string;
  masterVolume: number;
  globalVariation: {
    startTimeJitterMs: number;
  };
  events: VisualisationEvent[];
};

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const EVENT_ID = /^[a-z][a-z0-9_-]*$/;
const RIPPLE_SHAPES = new Set<RippleShape>(["normal", "partial", "wavy"]);

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function numberAt(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function integerAt(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
) {
  const number = numberAt(value, path, minimum, maximum);
  if (!Number.isInteger(number)) throw new Error(`${path} must be an integer`);
  return number;
}

function colourAt(value: unknown, path: string) {
  const colour = stringAt(value, path);
  if (!HEX_COLOUR.test(colour)) {
    throw new Error(`${path} must be a six-digit hex colour such as #A00000`);
  }
  return colour.toUpperCase();
}

function validatePartial(value: unknown, path: string): BellPartial {
  const partial = objectAt(value, path);
  return {
    name: stringAt(partial.name, `${path}.name`),
    ratio: numberAt(partial.ratio, `${path}.ratio`, 0.05, 16),
    gain: numberAt(partial.gain, `${path}.gain`, 0.000001, 2),
    decaySec: numberAt(partial.decaySec, `${path}.decaySec`, 0.05, 30),
    detuneCents: numberAt(
      partial.detuneCents,
      `${path}.detuneCents`,
      -100,
      100,
    ),
  };
}

function validateEvent(value: unknown, index: number): VisualisationEvent {
  const path = `events[${index}]`;
  const event = objectAt(value, path);
  const ripple = objectAt(event.ripple, `${path}.ripple`);
  const sound = objectAt(event.sound, `${path}.sound`);
  const shape = stringAt(ripple.shape, `${path}.ripple.shape`) as RippleShape;
  if (!RIPPLE_SHAPES.has(shape)) {
    throw new Error(`${path}.ripple.shape must be normal, partial, or wavy`);
  }
  if (!Array.isArray(sound.partials) || sound.partials.length === 0) {
    throw new Error(`${path}.sound.partials must contain at least one partial`);
  }
  if (!Array.isArray(sound.notePoolHz) || sound.notePoolHz.length === 0) {
    throw new Error(`${path}.sound.notePoolHz must contain at least one note`);
  }

  const id = stringAt(event.id, `${path}.id`);
  if (!EVENT_ID.test(id)) {
    throw new Error(`${path}.id must start with a letter and use a-z, 0-9, _ or -`);
  }

  return {
    id,
    name: stringAt(event.name, `${path}.name`),
    frequencyPerMinute: numberAt(
      event.frequencyPerMinute,
      `${path}.frequencyPerMinute`,
      0.001,
      1_000_000,
    ),
    jitter: numberAt(event.jitter, `${path}.jitter`, 0, 0.95),
    ripple: {
      color: colourAt(ripple.color, `${path}.ripple.color`),
      shape,
      maxSize: numberAt(ripple.maxSize, `${path}.ripple.maxSize`, 8, 500),
      fadeSeconds: numberAt(ripple.fadeSeconds, `${path}.ripple.fadeSeconds`, 0.1, 30),
    },
    sound: {
      voiceLabel: stringAt(sound.voiceLabel, `${path}.sound.voiceLabel`),
      primeHz: numberAt(sound.primeHz, `${path}.sound.primeHz`, 20, 18_000),
      notePoolHz: sound.notePoolHz.map((note, noteIndex) =>
        numberAt(note, `${path}.sound.notePoolHz[${noteIndex}]`, 20, 18_000),
      ),
      attackMs: numberAt(sound.attackMs, `${path}.sound.attackMs`, 0, 500),
      strikeNoise: numberAt(
        sound.strikeNoise,
        `${path}.sound.strikeNoise`,
        0,
        1,
      ),
      strikeNoiseDecayMs: numberAt(
        sound.strikeNoiseDecayMs,
        `${path}.sound.strikeNoiseDecayMs`,
        1,
        1_000,
      ),
      lowpassHz: numberAt(sound.lowpassHz, `${path}.sound.lowpassHz`, 100, 20_000),
      highpassHz: numberAt(sound.highpassHz, `${path}.sound.highpassHz`, 0, 5_000),
      reverbSend: numberAt(sound.reverbSend, `${path}.sound.reverbSend`, 0, 1),
      reverbTimeSec: numberAt(
        sound.reverbTimeSec,
        `${path}.sound.reverbTimeSec`,
        0.05,
        20,
      ),
      predelayMs: numberAt(sound.predelayMs, `${path}.sound.predelayMs`, 0, 250),
      spatialAmount: numberAt(
        sound.spatialAmount,
        `${path}.sound.spatialAmount`,
        0,
        1,
      ),
      stereoWidth: numberAt(sound.stereoWidth, `${path}.sound.stereoWidth`, 0, 1),
      pan: numberAt(sound.pan, `${path}.sound.pan`, -1, 1),
      pitchJitterCents: numberAt(
        sound.pitchJitterCents,
        `${path}.sound.pitchJitterCents`,
        0,
        100,
      ),
      gainJitter: numberAt(sound.gainJitter, `${path}.sound.gainJitter`, 0, 0.75),
      decayJitter: numberAt(
        sound.decayJitter,
        `${path}.sound.decayJitter`,
        0,
        0.5,
      ),
      masterGain: numberAt(sound.masterGain, `${path}.sound.masterGain`, 0, 5),
      maxVoices: integerAt(sound.maxVoices, `${path}.sound.maxVoices`, 1, 16),
      partials: sound.partials.map((partial, partialIndex) =>
        validatePartial(partial, `${path}.sound.partials[${partialIndex}]`),
      ),
    },
  };
}

function validateConfig(value: unknown): VisualisationConfig {
  const config = objectAt(value, "config");
  const globalVariation = objectAt(config.globalVariation, "config.globalVariation");
  if (!Array.isArray(config.events) || config.events.length === 0) {
    throw new Error("config.events must contain at least one event");
  }
  const events = config.events.map(validateEvent);
  const ids = new Set(events.map((event) => event.id));
  if (ids.size !== events.length) {
    throw new Error("Every event id must be unique");
  }

  return {
    backgroundColor: colourAt(config.backgroundColor, "config.backgroundColor"),
    masterVolume: numberAt(config.masterVolume, "config.masterVolume", 0, 1.5),
    globalVariation: {
      startTimeJitterMs: numberAt(
        globalVariation.startTimeJitterMs,
        "config.globalVariation.startTimeJitterMs",
        0,
        100,
      ),
    },
    events,
  };
}

export function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export const visualisationConfig = validateConfig(rawConfig);
