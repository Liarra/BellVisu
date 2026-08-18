"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  hexToRgb,
  visualisationConfig,
  type Rgb,
  type RippleShape,
  type VisualisationEvent,
} from "@/lib/visualisation-config";

type Ripple = {
  x: number;
  y: number;
  bornAt: number;
  maxSize: number;
  lifetimeMs: number;
  opacity: number;
  shape: RippleShape;
  colour: Rgb;
  eventId: string;
  stretch: number;
  angle: number;
  phase: number;
};

type ScheduledEvent = {
  at: number;
  stream: VisualisationEvent;
  audioSent: boolean;
};

type ScheduledBell = {
  eventId: string;
  delay: number;
};

type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  schedule: (events: ScheduledBell[]) => void;
  setEnabled: (eventId: string, enabled: boolean) => void;
};

type RippleRenderer = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  draw: (ripples: Ripple[], now: number) => void;
  destroy: () => void;
};

type BellVoice = {
  eventId: string;
  node: AudioNode;
  schedule: (events: ScheduledBell[]) => void;
  cancel: () => void;
};

const FRAME_INTERVAL = 1_000 / 30;
const SCHEDULE_AHEAD = 120;
const TEXTURE_SIZE = 320;
const BELL_OUTPUT_SCALE = 0.055;
const SHAPE_ORDER: RippleShape[] = ["normal", "partial", "wavy"];

function gaussian(value: number, center: number, width: number) {
  const distance = (value - center) / width;
  return Math.exp(-0.5 * distance * distance);
}

function angularDistance(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function openArcMask(angle: number, gapAxis: number) {
  const distance = Math.min(
    angularDistance(angle, gapAxis),
    angularDistance(angle, gapAxis + Math.PI),
  );
  const solidGap = (25 * Math.PI) / 180;
  const featheredEdge = (32 * Math.PI) / 180;

  if (distance <= solidGap) return 0;
  if (distance >= featheredEdge) return 1;

  const transition = (distance - solidGap) / (featheredEdge - solidGap);
  return transition * transition * (3 - 2 * transition);
}

function makeWavyGlyphPath(
  radius: number,
  amplitude: number,
  lobes: number,
  phase: number,
) {
  const points = 72;
  let path = "";
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const waveRadius = radius + Math.sin(angle * lobes + phase) * amplitude;
    const x = 32 + Math.cos(angle) * waveRadius;
    const y = 32 + Math.sin(angle) * waveRadius;
    path += `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${path}Z`;
}

const WAVY_GLYPH_PATHS = [
  makeWavyGlyphPath(10, 1.6, 6, 0),
  makeWavyGlyphPath(18, 1.35, 7, 0.85),
  makeWavyGlyphPath(27, 1.1, 8, 1.7),
];

function RippleGlyph({ shape, colour }: { shape: RippleShape; colour: string }) {
  const ringOpacities = [1, 0.84, 0.64];

  return (
    <svg
      className={`legend-ripple legend-ripple--${shape}`}
      style={{
        stroke: colour,
        filter: `drop-shadow(0 0 6px ${colour}cc)`,
      }}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${shape} ripple`}
    >
      {shape === "normal" &&
        [10, 18, 27].map((radius, index) => (
          <circle key={radius} cx="32" cy="32" r={radius} opacity={ringOpacities[index]} />
        ))}
      {shape === "partial" && (
        <>
          <circle cx="32" cy="32" r="10" />
          <circle
            cx="32"
            cy="32"
            r="18"
            pathLength="100"
            strokeDasharray="33.333 16.667"
            transform="rotate(-60 32 32)"
            opacity={ringOpacities[1]}
          />
          <circle
            cx="32"
            cy="32"
            r="27"
            pathLength="100"
            strokeDasharray="33.333 16.667"
            transform="rotate(-150 32 32)"
            opacity={ringOpacities[2]}
          />
        </>
      )}
      {shape === "wavy" &&
        WAVY_GLYPH_PATHS.map((path, index) => (
          <path key={path} d={path} opacity={ringOpacities[index]} />
        ))}
    </svg>
  );
}

function formatEventRate(eventsPerMinute: number) {
  if (eventsPerMinute === 6) return "6.0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    eventsPerMinute,
  );
}

function makeRippleTexture(
  shape: RippleShape,
  colour: Rgb,
  shadowColour: Rgb = [0, 0, 0],
) {
  const texture = document.createElement("canvas");
  texture.width = TEXTURE_SIZE;
  texture.height = TEXTURE_SIZE;

  const textureContext = texture.getContext("2d");
  if (!textureContext) return texture;

  const image = textureContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const centre = TEXTURE_SIZE / 2;
  const maxDistance = centre - 2;

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const radialPosition = Math.hypot(x - centre, y - centre) / maxDistance;
      if (radialPosition > 1) continue;

      const angle = Math.atan2(y - centre, x - centre);
      const isPartial = shape === "partial";
      const isWavy = shape === "wavy";
      const middleMask = isPartial ? openArcMask(angle, -Math.PI / 2) : 1;
      const outerMask = isPartial ? openArcMask(angle, 0) : 1;
      const innerCentre = isWavy ? 0.34 + Math.sin(angle * 6) * 0.045 : 0.34;
      const middleCentre = isWavy
        ? 0.61 + Math.sin(angle * 7 + 0.85) * 0.038
        : 0.61;
      const outerCentre = isWavy
        ? 0.88 + Math.sin(angle * 8 + 1.7) * 0.031
        : 0.88;

      const light =
        gaussian(radialPosition, innerCentre, 0.018) +
        gaussian(radialPosition, middleCentre, 0.024) * 0.52 * middleMask +
        gaussian(radialPosition, outerCentre, 0.034) * 0.19 * outerMask;
      const shadow =
        gaussian(radialPosition, innerCentre + 0.045, 0.026) * 0.28 +
        gaussian(radialPosition, middleCentre + 0.055, 0.034) * 0.15 * middleMask +
        gaussian(radialPosition, outerCentre + 0.06, 0.044) * 0.06 * outerMask;

      const pixel = (y * TEXTURE_SIZE + x) * 4;
      const pixelColour = light >= shadow ? colour : shadowColour;
      image.data[pixel] = pixelColour[0];
      image.data[pixel + 1] = pixelColour[1];
      image.data[pixel + 2] = pixelColour[2];
      image.data[pixel + 3] = Math.min(
        255,
        light >= shadow ? light * 238 : (shadow - light) * 172,
      );
    }
  }

  textureContext.putImageData(image, 0, 0);
  return texture;
}

function makeReverbImpulse(context: AudioContext, duration: number) {
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 3.2);
    }
  }

  return impulse;
}

function makeFallbackBellOutput(
  context: AudioContext,
  stream: VisualisationEvent,
): BellVoice {
  const processor = context.createScriptProcessor(2_048, 0, 2);
  const queue: number[] = [];
  const attackSamples = Math.max(
    1,
    Math.round((stream.sound.attackMs / 1_000) * context.sampleRate),
  );
  const noiseDamping = Math.exp(
    Math.log(0.001) /
      ((stream.sound.strikeNoiseDecayMs / 1_000) * context.sampleRate),
  );
  const voices = Array.from({ length: stream.sound.maxVoices }, () => ({
    leftGain: Math.sqrt((1 - stream.sound.pan) * 0.5),
    rightGain: Math.sqrt((1 + stream.sound.pan) * 0.5),
    noiseEnvelope: 0,
    attackRemaining: 0,
    partials: stream.sound.partials.map(() => ({
      x: 0,
      y: 0,
      cosine: 1,
      sine: 0,
      damping: 0,
    })),
  }));
  let voiceCursor = 0;

  const strike = () => {
    const voice = voices[voiceCursor % voices.length];
    voiceCursor += 1;
    const note =
      stream.sound.notePoolHz[
        Math.floor(Math.random() * stream.sound.notePoolHz.length)
      ];
    const pitchJitter =
      (Math.random() * 2 - 1) * stream.sound.pitchJitterCents;
    const gainMultiplier =
      1 + (Math.random() * 2 - 1) * stream.sound.gainJitter;
    const decayMultiplier =
      1 + (Math.random() * 2 - 1) * stream.sound.decayJitter;
    const pan = Math.max(
      -1,
      Math.min(
        1,
        stream.sound.pan +
          (Math.random() * 2 - 1) * stream.sound.stereoWidth * 0.5,
      ),
    );
    voice.leftGain = Math.sqrt((1 - pan) * 0.5);
    voice.rightGain = Math.sqrt((1 + pan) * 0.5);
    voice.noiseEnvelope =
      stream.sound.strikeNoise * gainMultiplier * BELL_OUTPUT_SCALE;
    voice.attackRemaining = attackSamples;

    for (let index = 0; index < voice.partials.length; index += 1) {
      const partial = voice.partials[index];
      const definition = stream.sound.partials[index];
      const pitchMultiplier =
        2 ** ((definition.detuneCents + pitchJitter) / 1_200);
      const pitchHz = note * definition.ratio * pitchMultiplier;
      const angle = (Math.PI * 2 * pitchHz) / context.sampleRate;
      const level = definition.gain * gainMultiplier * BELL_OUTPUT_SCALE;
      const phase = Math.random() * Math.PI * 2;
      const targetX = Math.cos(phase) * level;
      const targetY = Math.sin(phase) * level;
      partial.x = targetX;
      partial.y = targetY;
      partial.cosine = Math.cos(angle);
      partial.sine = Math.sin(angle);
      partial.damping = Math.exp(
        Math.log(0.001) /
          (definition.decaySec * decayMultiplier * context.sampleRate),
      );
    }
  };

  processor.onaudioprocess = (event) => {
    const left = event.outputBuffer.getChannelData(0);
    const right = event.outputBuffer.getChannelData(1);
    let consumed = 0;

    for (let sample = 0; sample < left.length; sample += 1) {
      const sampleTime = event.playbackTime + sample / context.sampleRate;
      while (consumed < queue.length && queue[consumed] <= sampleTime) {
        strike();
        consumed += 1;
      }

      let leftOutput = 0;
      let rightOutput = 0;
      for (const voice of voices) {
        const attackGain =
          voice.attackRemaining > 0
            ? 1 - voice.attackRemaining / attackSamples
            : 1;
        if (voice.attackRemaining > 0) voice.attackRemaining -= 1;
        let resonantOutput = 0;
        for (const partial of voice.partials) {
          const nextX =
            (partial.x * partial.cosine - partial.y * partial.sine) *
            partial.damping;
          const nextY =
            (partial.x * partial.sine + partial.y * partial.cosine) *
            partial.damping;
          partial.x = nextX;
          partial.y = nextY;
          resonantOutput += nextX;
        }
        const voiceOutput =
          resonantOutput * attackGain +
          (Math.random() * 2 - 1) * voice.noiseEnvelope;
        voice.noiseEnvelope *= noiseDamping;
        leftOutput += voiceOutput * voice.leftGain;
        rightOutput += voiceOutput * voice.rightGain;
      }
      left[sample] = leftOutput;
      right[sample] = rightOutput;
    }

    if (consumed > 0) queue.splice(0, consumed);
  };

  return {
    eventId: stream.id,
    node: processor as AudioNode,
    schedule(events) {
      const now = context.currentTime;
      for (const event of events) queue.push(now + event.delay);
      queue.sort((first, second) => first - second);
    },
    cancel() {
      queue.length = 0;
      for (const voice of voices) {
        voice.noiseEnvelope = 0;
        voice.attackRemaining = 0;
        for (const partial of voice.partials) {
          partial.x = 0;
          partial.y = 0;
        }
      }
    },
  };
}

function makeWorkletBellOutput(
  context: AudioContext,
  stream: VisualisationEvent,
): BellVoice {
  const bell = new AudioWorkletNode(context, "bell-field", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      signatures: [
        {
          id: stream.id,
          sound: stream.sound,
        },
      ],
    },
  });

  return {
    eventId: stream.id,
    node: bell,
    schedule(events) {
      bell.port.postMessage({ events });
    },
    cancel() {
      bell.port.postMessage({ cancel: true });
    },
  };
}

async function buildAudioEngine(context: AudioContext): Promise<AudioEngine> {
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();

  master.gain.value = 0;
  limiter.threshold.value = -18;
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.24;
  master.connect(limiter);
  limiter.connect(context.destination);

  let workletReady = false;
  if (context.audioWorklet) {
    try {
      await context.audioWorklet.addModule("/bell-processor.js");
      workletReady = true;
    } catch {
      workletReady = false;
    }
  }

  const voices = new Map<
    string,
    { voice: BellVoice; eventOutput: GainNode; enabled: boolean }
  >();
  for (const stream of visualisationConfig.events) {
    let voice: BellVoice;
    if (workletReady) {
      try {
        voice = makeWorkletBellOutput(context, stream);
      } catch {
        voice = makeFallbackBellOutput(context, stream);
      }
    } else {
      voice = makeFallbackBellOutput(context, stream);
    }

    const voiceLevel = context.createGain();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const reverbPredelay = context.createDelay(0.25);
    const reverb = context.createConvolver();
    const reverbLevel = context.createGain();
    const eventOutput = context.createGain();
    voiceLevel.gain.value = stream.sound.masterGain;
    highpass.type = "highpass";
    highpass.frequency.value = stream.sound.highpassHz;
    highpass.Q.value = 0.6;
    lowpass.type = "lowpass";
    lowpass.frequency.value = stream.sound.lowpassHz;
    lowpass.Q.value = 0.55;
    reverbPredelay.delayTime.value = stream.sound.predelayMs / 1_000;
    reverb.buffer = makeReverbImpulse(context, stream.sound.reverbTimeSec);
    reverbLevel.gain.value = stream.sound.reverbSend;
    eventOutput.gain.value = 1;

    voice.node.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(voiceLevel);
    voiceLevel.connect(eventOutput);
    voiceLevel.connect(reverbPredelay);
    reverbPredelay.connect(reverb);
    reverb.connect(reverbLevel);
    reverbLevel.connect(eventOutput);
    eventOutput.connect(master);
    voices.set(stream.id, { voice, eventOutput, enabled: true });
  }

  return {
    context,
    master,
    schedule(events) {
      const batches = new Map<string, ScheduledBell[]>();
      const timingJitter =
        visualisationConfig.globalVariation.startTimeJitterMs / 1_000;
      for (const event of events) {
        const batch = batches.get(event.eventId) ?? [];
        batch.push({
          ...event,
          delay: Math.max(
            0,
            event.delay + (Math.random() * 2 - 1) * timingJitter,
          ),
        });
        batches.set(event.eventId, batch);
      }
      for (const [eventId, batch] of batches) {
        const output = voices.get(eventId);
        if (output?.enabled) output.voice.schedule(batch);
      }
    },
    setEnabled(eventId, enabled) {
      const output = voices.get(eventId);
      if (!output || output.enabled === enabled) return;
      output.enabled = enabled;
      const now = context.currentTime;
      output.eventOutput.gain.cancelScheduledValues(now);
      output.eventOutput.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.006);
      if (!enabled) output.voice.cancel();
    },
  };
}

function nextEventDelay(frequencyPerMinute: number, jitter: number) {
  const baseInterval = 60_000 / frequencyPerMinute;
  const boundedVariation = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(baseInterval * 0.05, baseInterval * boundedVariation);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createGpuRenderer(
  canvas: HTMLCanvasElement,
  textures: Record<RippleShape, HTMLCanvasElement>,
  background: Rgb,
): RippleRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
      in vec2 a_vertex;
      in vec4 a_instance;
      in vec4 a_motion;
      in vec4 a_appearance;
      uniform vec2 u_resolution;
      out vec2 v_uv;
      out float v_alpha;
      out float v_progress;
      flat out vec3 v_colour;
      flat out int v_shape;
      void main() {
        float breathing = sin(a_motion.z * 9.0 + a_motion.w) * 0.014 * (1.0 - a_motion.z);
        float deformation = a_motion.x + breathing;
        vec2 local = a_vertex * a_instance.z * vec2(1.0 + deformation, 1.0 - deformation);
        float sine = sin(a_motion.y);
        float cosine = cos(a_motion.y);
        local = mat2(cosine, -sine, sine, cosine) * local;
        vec2 pixel = a_instance.xy + local;
        vec2 clip = pixel / u_resolution * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        v_uv = a_vertex * 0.5 + 0.5;
        v_alpha = a_instance.w;
        v_progress = a_motion.z;
        v_colour = a_appearance.rgb;
        v_shape = int(a_appearance.a + 0.5);
      }
    `,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
      precision mediump float;
      in vec2 v_uv;
      in float v_alpha;
      in float v_progress;
      flat in vec3 v_colour;
      flat in int v_shape;
      uniform sampler2D u_normal;
      uniform sampler2D u_partial;
      uniform sampler2D u_wavy;
      uniform vec3 u_background;
      out vec4 outColor;
      void main() {
        vec4 textureValue;
        if (v_shape == 0) {
          textureValue = texture(u_normal, v_uv);
        } else if (v_shape == 1) {
          textureValue = texture(u_partial, v_uv);
        } else {
          textureValue = texture(u_wavy, v_uv);
        }

        float brightness = max(textureValue.r, max(textureValue.g, textureValue.b));
        vec3 colour = mix(u_background * 0.22, v_colour, brightness);
        vec2 radial = v_uv - 0.5;
        float radialLength = length(radial);
        vec2 radialDirection = radial * inversesqrt(max(dot(radial, radial), 0.0001));
        vec2 lightDirection = normalize(vec2(-0.58, -0.82));
        float incidence = dot(radialDirection, lightDirection);
        float directionalLight = 0.76 + (incidence * 0.5 + 0.5) * 0.42;
        colour *= mix(0.92, directionalLight, brightness);

        float impactLife = 1.0 - smoothstep(0.025, 0.17, v_progress);
        float dimple = (1.0 - smoothstep(0.025, 0.105, radialLength)) * impactLife;
        float dimpleShade = smoothstep(0.025, 0.085, radialLength) *
          (1.0 - smoothstep(0.085, 0.135, radialLength)) * impactLife;
        colour = mix(colour, v_colour, dimple * 0.62);
        colour = mix(colour, u_background * 0.3, dimpleShade * 0.48);

        float alpha = max(textureValue.a, max(dimple * 0.34, dimpleShade * 0.25));
        alpha *= v_alpha;
        if (alpha < 0.003) discard;
        outColor = vec4(colour, alpha);
      }
    `,
  );
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }

  const vertexBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  const vertexArray = gl.createVertexArray();
  if (!vertexBuffer || !instanceBuffer || !vertexArray) return null;

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const vertexLocation = gl.getAttribLocation(program, "a_vertex");
  gl.enableVertexAttribArray(vertexLocation);
  gl.vertexAttribPointer(vertexLocation, 2, gl.FLOAT, false, 0, 0);

  const stride = 48;
  let instanceCapacity = 2_048;
  let instanceData = new Float32Array(instanceCapacity * 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

  const instanceLocation = gl.getAttribLocation(program, "a_instance");
  const motionLocation = gl.getAttribLocation(program, "a_motion");
  const appearanceLocation = gl.getAttribLocation(program, "a_appearance");
  gl.enableVertexAttribArray(instanceLocation);
  gl.vertexAttribPointer(instanceLocation, 4, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(instanceLocation, 1);
  gl.enableVertexAttribArray(motionLocation);
  gl.vertexAttribPointer(motionLocation, 4, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(motionLocation, 1);
  gl.enableVertexAttribArray(appearanceLocation);
  gl.vertexAttribPointer(appearanceLocation, 4, gl.FLOAT, false, stride, 32);
  gl.vertexAttribDivisor(appearanceLocation, 1);

  const shapeIndex: Record<RippleShape, number> = {
    normal: 0,
    partial: 1,
    wavy: 2,
  };
  const gpuTextures: WebGLTexture[] = [];
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  SHAPE_ORDER.forEach((shape, index) => {
    const gpuTexture = gl.createTexture();
    if (!gpuTexture) return;
    gpuTextures.push(gpuTexture);
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, gpuTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      textures[shape],
    );
  });

  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "u_normal"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_partial"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_wavy"), 2);
  gl.uniform3f(
    gl.getUniformLocation(program, "u_background"),
    background[0] / 255,
    background[1] / 255,
    background[2] / 255,
  );
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(background[0] / 255, background[1] / 255, background[2] / 255, 1);

  let width = 1;
  let height = 1;

  return {
    resize(nextWidth, nextHeight, pixelRatio) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
    },
    draw(ripples, now) {
      if (ripples.length > instanceCapacity) {
        while (instanceCapacity < ripples.length) instanceCapacity *= 2;
        instanceData = new Float32Array(instanceCapacity * 12);
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);
      }

      for (let index = 0; index < ripples.length; index += 1) {
        const ripple = ripples[index];
        const progress = Math.min(1, (now - ripple.bornAt) / ripple.lifetimeMs);
        const expansion = progress * (2 - progress);
        const radius = 5 + ripple.maxSize * expansion;
        const fadeIn = Math.min(1, (now - ripple.bornAt) / 160);
        const fadeOut = Math.pow(1 - progress, 1.32);
        const offset = index * 12;
        instanceData[offset] = ripple.x;
        instanceData[offset + 1] = ripple.y;
        instanceData[offset + 2] = radius;
        instanceData[offset + 3] = fadeIn * fadeOut * ripple.opacity;
        instanceData[offset + 4] = ripple.stretch;
        instanceData[offset + 5] = ripple.angle + progress * 0.035 * Math.sin(ripple.phase);
        instanceData[offset + 6] = progress;
        instanceData[offset + 7] = ripple.phase;
        instanceData[offset + 8] = ripple.colour[0] / 255;
        instanceData[offset + 9] = ripple.colour[1] / 255;
        instanceData[offset + 10] = ripple.colour[2] / 255;
        instanceData[offset + 11] = shapeIndex[ripple.shape];
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        instanceData.subarray(0, ripples.length * 12),
      );
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ripples.length);
    },
    destroy() {
      gpuTextures.forEach((texture) => gl.deleteTexture(texture));
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    },
  };
}

function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  textures: Record<string, HTMLCanvasElement>,
  background: string,
): RippleRenderer | null {
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!context) return null;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;

  return {
    resize(nextWidth, nextHeight, nextPixelRatio) {
      width = nextWidth;
      height = nextHeight;
      pixelRatio = nextPixelRatio;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.imageSmoothingEnabled = true;
    },
    draw(ripples, now) {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.globalAlpha = 1;
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      for (const ripple of ripples) {
        const progress = Math.min(1, (now - ripple.bornAt) / ripple.lifetimeMs);
        const radius = 5 + ripple.maxSize * progress * (2 - progress);
        context.globalAlpha =
          Math.min(1, (now - ripple.bornAt) / 160) *
          Math.pow(1 - progress, 1.32) *
          ripple.opacity;
        context.drawImage(
          textures[ripple.eventId],
          ripple.x - radius,
          ripple.y - radius,
          radius * 2,
          radius * 2,
        );
      }
      context.globalAlpha = 1;
    },
    destroy() {},
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const audioInitRef = useRef<Promise<AudioEngine> | null>(null);
  const soundEnabledRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const enabledEventIdsRef = useRef(
    new Set(visualisationConfig.events.map((stream) => stream.id)),
  );
  const [enabledEventIds, setEnabledEventIds] = useState(
    () => new Set(visualisationConfig.events.map((stream) => stream.id)),
  );

  const toggleEvent = (eventId: string) => {
    const next = new Set(enabledEventIdsRef.current);
    const enabled = !next.has(eventId);
    if (enabled) next.add(eventId);
    else next.delete(eventId);
    enabledEventIdsRef.current = next;
    setEnabledEventIds(next);
    audioEngineRef.current?.setEnabled(eventId, enabled);
  };

  const toggleSound = () => {
    const nextState = !soundEnabledRef.current;
    soundEnabledRef.current = nextState;
    setSoundEnabled(nextState);

    const existingEngine = audioEngineRef.current;
    if (existingEngine) {
      const now = existingEngine.context.currentTime;
      if (nextState) void existingEngine.context.resume();
      existingEngine.master.gain.cancelScheduledValues(now);
      existingEngine.master.gain.setTargetAtTime(
        nextState ? visualisationConfig.masterVolume : 0,
        now,
        0.015,
      );
      return;
    }

    if (!nextState || audioInitRef.current) return;

    const context = new AudioContext({ latencyHint: "interactive" });
    void context.resume();
    audioInitRef.current = buildAudioEngine(context);
    void audioInitRef.current
      .then((engine) => {
        audioEngineRef.current = engine;
        for (const stream of visualisationConfig.events) {
          engine.setEnabled(stream.id, enabledEventIdsRef.current.has(stream.id));
        }
        if (soundEnabledRef.current) {
          engine.master.gain.setTargetAtTime(
            visualisationConfig.masterVolume,
            engine.context.currentTime,
            0.015,
          );
        }
      })
      .catch((error) => {
        console.error("Bell audio engine failed to start", error);
        soundEnabledRef.current = false;
        setSoundEnabled(false);
        void context.close();
        audioInitRef.current = null;
      });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const backgroundRgb = hexToRgb(visualisationConfig.backgroundColor);
    const shapeTextures = Object.fromEntries(
      SHAPE_ORDER.map((shape) => [shape, makeRippleTexture(shape, [255, 255, 255])]),
    ) as Record<RippleShape, HTMLCanvasElement>;
    let renderer = createGpuRenderer(canvas, shapeTextures, backgroundRgb);
    if (!renderer) {
      const shadowColour = backgroundRgb.map((channel) =>
        Math.round(channel * 0.25),
      ) as Rgb;
      const eventTextures = Object.fromEntries(
        visualisationConfig.events.map((stream) => [
          stream.id,
          makeRippleTexture(
            stream.ripple.shape,
            hexToRgb(stream.ripple.color),
            shadowColour,
          ),
        ]),
      );
      renderer = createCanvasRenderer(
        canvas,
        eventTextures,
        visualisationConfig.backgroundColor,
      );
    }
    if (!renderer) return;

    const activeRenderer = renderer;
    const ripples: Ripple[] = [];
    const pendingEvents: ScheduledEvent[] = [];
    const streams = visualisationConfig.events.map((stream) => ({
      stream,
      nextAt: 0,
    }));
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let lastFrameAt = 0;
    let previousFrameAt = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      activeRenderer.resize(
        width,
        height,
        Math.min(window.devicePixelRatio || 1, 1.25),
      );
    };

    const resetSchedule = (now: number) => {
      pendingEvents.length = 0;
      for (const state of streams) {
        state.nextAt =
          now + nextEventDelay(state.stream.frequencyPerMinute, state.stream.jitter);
      }
    };

    const spawnRipple = (event: ScheduledEvent) => {
      ripples.push({
        x: Math.random() * width,
        y: Math.random() * height,
        bornAt: event.at,
        maxSize: event.stream.ripple.maxSize * (0.9 + Math.random() * 0.1),
        lifetimeMs: event.stream.ripple.fadeSeconds * 1_000,
        opacity: 0.86 + Math.random() * 0.14,
        shape: event.stream.ripple.shape,
        colour: hexToRgb(event.stream.ripple.color),
        eventId: event.stream.id,
        stretch: (Math.random() - 0.5) * 0.075,
        angle: Math.random() * Math.PI,
        phase: Math.random() * Math.PI * 2,
      });
    };

    const scheduleEvents = (now: number) => {
      const horizon = now + SCHEDULE_AHEAD;
      for (let index = pendingEvents.length - 1; index >= 0; index -= 1) {
        if (!enabledEventIdsRef.current.has(pendingEvents[index].stream.id)) {
          pendingEvents.splice(index, 1);
        }
      }
      for (const state of streams) {
        if (!enabledEventIdsRef.current.has(state.stream.id)) {
          state.nextAt =
            horizon +
            nextEventDelay(state.stream.frequencyPerMinute, state.stream.jitter);
          continue;
        }
        while (state.nextAt <= horizon) {
          pendingEvents.push({
            at: state.nextAt,
            stream: state.stream,
            audioSent: false,
          });
          state.nextAt += nextEventDelay(
            state.stream.frequencyPerMinute,
            state.stream.jitter,
          );
        }
      }
      pendingEvents.sort((first, second) => first.at - second.at);

      const audioEngine = audioEngineRef.current;
      if (soundEnabledRef.current && audioEngine) {
        const audioBatch: ScheduledBell[] = [];
        for (const event of pendingEvents) {
          if (
            !event.audioSent &&
            enabledEventIdsRef.current.has(event.stream.id)
          ) {
            audioBatch.push({
              eventId: event.stream.id,
              delay: Math.max(0, (event.at - now) / 1_000),
            });
            event.audioSent = true;
          }
        }
        if (audioBatch.length > 0) audioEngine.schedule(audioBatch);
      }

      let dueCount = 0;
      while (dueCount < pendingEvents.length && pendingEvents[dueCount].at <= now) {
        if (enabledEventIdsRef.current.has(pendingEvents[dueCount].stream.id)) {
          spawnRipple(pendingEvents[dueCount]);
        }
        dueCount += 1;
      }
      if (dueCount > 0) pendingEvents.splice(0, dueCount);
    };

    const render = (now: number) => {
      animationFrame = requestAnimationFrame(render);
      if (now - lastFrameAt < FRAME_INTERVAL) return;
      lastFrameAt = now;

      if (now - previousFrameAt > 1_000) resetSchedule(now);
      previousFrameAt = now;
      scheduleEvents(now);

      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (
          !enabledEventIdsRef.current.has(ripples[index].eventId) ||
          now - ripples[index].bornAt >= ripples[index].lifetimeMs
        ) {
          ripples.splice(index, 1);
        }
      }
      activeRenderer.draw(ripples, now);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      activeRenderer.destroy();
    };
  }, []);

  const fieldStyle = {
    "--field-background": visualisationConfig.backgroundColor,
  } as CSSProperties;

  return (
    <main
      className="ripple-field"
      style={fieldStyle}
      aria-label="A field of statistically timed red ripples"
    >
      <canvas ref={canvasRef} className="ripple-canvas" aria-hidden="true" />
      <button
        type="button"
        className={`sound-toggle${soundEnabled ? " sound-toggle--on" : ""}`}
        aria-pressed={soundEnabled}
        onClick={toggleSound}
      >
        <span className="sound-toggle__light" aria-hidden="true" />
        {soundEnabled ? "Sound on" : "Enable sound"}
      </button>
      <aside className="event-legend" aria-labelledby="event-legend-title">
        <header className="event-legend__header">
          <h2 id="event-legend-title">Event key</h2>
          <span>Events / minute</span>
        </header>
        <ul className="event-legend__list">
          {visualisationConfig.events.map((stream) => {
            const enabled = enabledEventIds.has(stream.id);
            return (
              <li
                className={`event-legend__item${enabled ? "" : " event-legend__item--disabled"}`}
                key={stream.id}
              >
                <button
                  type="button"
                  className={`event-switch${enabled ? " event-switch--on" : ""}`}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${enabled ? "Disable" : "Enable"} ${stream.name}`}
                  onClick={() => toggleEvent(stream.id)}
                >
                  <span aria-hidden="true" />
                </button>
                <RippleGlyph
                  shape={stream.ripple.shape}
                  colour={stream.ripple.color}
                />
                <div className="event-legend__identity">
                  <strong>{stream.name}</strong>
                <span>{stream.sound.voiceLabel}</span>
                </div>
                <div className="event-legend__rate">
                  <strong>{formatEventRate(stream.frequencyPerMinute)}</strong>
                  <span>events/min</span>
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="event-legend__footer">
          <Link href="/about">About this visualisation</Link>
        </footer>
      </aside>
      <p className="sr-only">
        {visualisationConfig.events.length} independent statistical event streams
        generate ripples. Each stream has its own timing, colour, shape, and bell.
      </p>
    </main>
  );
}
