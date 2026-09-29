class FrameRecorder {
  constructor(maxFrames) {
    this.max = maxFrames;
    this.state = {};
    this.frames = [];
  }
  set(key, value) {
    this.state[key] = value;
  }
  append(key, value) {
    if (!(key in this.state)) this.state[key] = [];
    this.state[key].push(value);
  }
  push(note, tag) {
    if (this.frames.length > this.max) return;
    const snapshot = JSON.parse(JSON.stringify(this.state));
    if (this.frames.length === this.max) {
      this.frames.push({
        state: snapshot,
        note: "Stopped: frame limit reached.",
        tag: "limit",
      });
      return;
    }
    this.frames.push({ state: snapshot, note, tag });
  }
  full() {
    return this.frames.length > this.max;
  }
  done() {
    return this.frames;
  }
}
