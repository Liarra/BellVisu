import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configUrl = new URL("../config/visualisation.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));

test("visualisation config contains independently configurable events", () => {
  assert.match(config.backgroundColor, /^#[0-9a-f]{6}$/i);
  assert.ok(config.masterVolume >= 0);
  assert.ok(config.events.length > 0);

  const ids = new Set();
  for (const event of config.events) {
    assert.match(event.id, /^[a-z][a-z0-9_-]*$/);
    assert.ok(!ids.has(event.id), `duplicate event id: ${event.id}`);
    ids.add(event.id);
    assert.ok(event.frequencyPerMinute > 0);
    assert.ok(event.jitter >= 0 && event.jitter <= 0.95);
    assert.ok(["normal", "partial", "wavy"].includes(event.ripple.shape));
    assert.match(event.ripple.color, /^#[0-9a-f]{6}$/i);
    assert.ok(event.ripple.maxSize > 0);
    assert.ok(event.ripple.fadeSeconds > 0);
    assert.ok(event.sound.partials.length > 0);
  }
});
