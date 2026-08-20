const BELL_OUTPUT_SCALE = 0.055;

class BellFieldProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.triggers = [];
    this.signatures = {};

    const signatures = options.processorOptions?.signatures;
    if (Array.isArray(signatures)) {
      for (const definition of signatures) {
        const sound = definition?.sound;
        if (!definition?.id || !sound || !Array.isArray(sound.partials)) continue;

        const maxVoices = Math.max(1, Math.min(16, Math.round(sound.maxVoices || 1)));
        this.signatures[definition.id] = {
          sound,
          voiceCursor: 0,
          attackSamples: Math.max(
            1,
            Math.round(((Number(sound.attackMs) || 0) / 1000) * sampleRate),
          ),
          noiseDamping: Math.exp(
            Math.log(0.001) /
              (Math.max(0.001, (Number(sound.strikeNoiseDecayMs) || 1) / 1000) *
                sampleRate),
          ),
          voices: Array.from({ length: maxVoices }, () => ({
            leftGain: Math.sqrt((1 - sound.pan) * 0.5),
            rightGain: Math.sqrt((1 + sound.pan) * 0.5),
            noiseEnvelope: 0,
            attackRemaining: 0,
            partials: sound.partials.map(() => ({
              x: 0,
              y: 0,
              cosine: 1,
              sine: 0,
              damping: 0,
            })),
          })),
        };
      }
    }

    this.port.onmessage = (message) => {
      if (message.data?.cancel) {
        this.triggers.length = 0;
        for (const signature of Object.values(this.signatures)) {
          for (const voice of signature.voices) {
            voice.noiseEnvelope = 0;
            voice.attackRemaining = 0;
            for (const partial of voice.partials) {
              partial.x = 0;
              partial.y = 0;
            }
          }
        }
        return;
      }

      const events = message.data?.events;
      if (!Array.isArray(events)) return;
      for (const event of events) {
        if (!this.signatures[event.eventId]) continue;
        this.triggers.push({
          frame:
            currentFrame +
            Math.max(0, Math.round((Number(event.delay) || 0) * sampleRate)),
          eventId: event.eventId,
          pan: Math.max(-1, Math.min(1, Number(event.pan) || 0)),
        });
      }
      this.triggers.sort((first, second) => first.frame - second.frame);
    };
  }

  strike(eventId, scheduledPan) {
    const signature = this.signatures[eventId];
    if (!signature) return;

    const { sound } = signature;
    const voice = signature.voices[signature.voiceCursor % signature.voices.length];
    signature.voiceCursor += 1;
    const note = sound.notePoolHz[Math.floor(Math.random() * sound.notePoolHz.length)];
    const pitchJitter = (Math.random() * 2 - 1) * sound.pitchJitterCents;
    const gainMultiplier = 1 + (Math.random() * 2 - 1) * sound.gainJitter;
    const decayMultiplier = 1 + (Math.random() * 2 - 1) * sound.decayJitter;
    const pan = Math.max(
      -1,
      Math.min(
        1,
        scheduledPan + (Math.random() * 2 - 1) * sound.stereoWidth * 0.5,
      ),
    );
    voice.leftGain = Math.sqrt((1 - pan) * 0.5);
    voice.rightGain = Math.sqrt((1 + pan) * 0.5);
    voice.noiseEnvelope = sound.strikeNoise * gainMultiplier * BELL_OUTPUT_SCALE;
    voice.attackRemaining = signature.attackSamples;

    for (let index = 0; index < voice.partials.length; index += 1) {
      const partial = voice.partials[index];
      const definition = sound.partials[index];
      const pitchMultiplier =
        2 ** ((definition.detuneCents + pitchJitter) / 1200);
      const pitchHz = note * definition.ratio * pitchMultiplier;
      const angle = (Math.PI * 2 * pitchHz) / sampleRate;
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
          (definition.decaySec * decayMultiplier * sampleRate),
      );
    }
  }

  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    let consumed = 0;

    for (let sample = 0; sample < left.length; sample += 1) {
      const frame = currentFrame + sample;
      while (
        consumed < this.triggers.length &&
        this.triggers[consumed].frame <= frame
      ) {
        this.strike(
          this.triggers[consumed].eventId,
          this.triggers[consumed].pan,
        );
        consumed += 1;
      }

      let leftSample = 0;
      let rightSample = 0;
      for (const signature of Object.values(this.signatures)) {
        for (const voice of signature.voices) {
          const attackGain =
            voice.attackRemaining > 0
              ? 1 - voice.attackRemaining / signature.attackSamples
              : 1;
          if (voice.attackRemaining > 0) voice.attackRemaining -= 1;
          let resonantSample = 0;
          for (const partial of voice.partials) {
            const nextX =
              (partial.x * partial.cosine - partial.y * partial.sine) *
              partial.damping;
            const nextY =
              (partial.x * partial.sine + partial.y * partial.cosine) *
              partial.damping;
            partial.x = nextX;
            partial.y = nextY;
            resonantSample += nextX;
          }
          const voiceSample =
            resonantSample * attackGain +
            (Math.random() * 2 - 1) * voice.noiseEnvelope;
          voice.noiseEnvelope *= signature.noiseDamping;
          leftSample += voiceSample * voice.leftGain;
          rightSample += voiceSample * voice.rightGain;
        }
      }

      left[sample] = leftSample;
      right[sample] = rightSample;
    }

    if (consumed > 0) this.triggers.splice(0, consumed);
    return true;
  }
}

registerProcessor("bell-field", BellFieldProcessor);
