class BellFieldProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.triggers = [];
    this.signatures = {};

    const signatures = options.processorOptions?.signatures;
    if (Array.isArray(signatures)) {
      for (const signature of signatures) {
        if (!signature?.id || !Array.isArray(signature.partials)) continue;
        this.signatures[signature.id] = {
          pan: Math.max(-1, Math.min(1, Number(signature.pan) || 0)),
          partials: signature.partials.map((partial) => {
            const pitchHz = Number(partial.pitchHz);
            const amplitude = Number(partial.amplitude);
            const decaySeconds = Number(partial.decaySeconds);
            const angle = (Math.PI * 2 * pitchHz) / sampleRate;
            return {
              x: 0,
              y: 0,
              cosine: Math.cos(angle),
              sine: Math.sin(angle),
              damping: Math.exp(Math.log(0.001) / (decaySeconds * sampleRate)),
              level: amplitude,
            };
          }),
        };
      }
    }

    this.port.onmessage = (message) => {
      if (message.data?.cancel) {
        this.triggers.length = 0;
        for (const signature of Object.values(this.signatures)) {
          for (const partial of signature.partials) {
            partial.x = 0;
            partial.y = 0;
          }
        }
        return;
      }
      const events = message.data?.events;
      if (!Array.isArray(events)) return;
      for (const event of events) {
        if (!this.signatures[event.eventId]) continue;
        this.triggers.push({
          frame: currentFrame + Math.max(0, Math.round((event.delay || 0) * sampleRate)),
          eventId: event.eventId,
        });
      }
      this.triggers.sort((first, second) => first.frame - second.frame);
    };
  }

  strike(eventId) {
    const signature = this.signatures[eventId];
    if (!signature) return;
    for (const partial of signature.partials) {
      const phase = Math.random() * Math.PI * 2;
      partial.x += Math.cos(phase) * partial.level;
      partial.y += Math.sin(phase) * partial.level;
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
        this.strike(this.triggers[consumed].eventId);
        consumed += 1;
      }

      let leftSample = 0;
      let rightSample = 0;
      for (const signature of Object.values(this.signatures)) {
        const leftGain = Math.sqrt((1 - signature.pan) * 0.5);
        const rightGain = Math.sqrt((1 + signature.pan) * 0.5);
        for (const partial of signature.partials) {
          const nextX =
            (partial.x * partial.cosine - partial.y * partial.sine) *
            partial.damping;
          const nextY =
            (partial.x * partial.sine + partial.y * partial.cosine) *
            partial.damping;
          partial.x = nextX;
          partial.y = nextY;
          leftSample += nextX * leftGain;
          rightSample += nextX * rightGain;
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
