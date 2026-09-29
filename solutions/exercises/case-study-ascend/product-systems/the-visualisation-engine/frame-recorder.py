import copy


class FrameRecorder:
    def __init__(self, max_frames):
        self.max = max_frames
        self.state = {}
        self.frames = []

    def set(self, key, value):
        self.state[key] = value

    def append(self, key, value):
        self.state.setdefault(key, []).append(value)

    def push(self, note, tag):
        if len(self.frames) > self.max:
            return
        if len(self.frames) == self.max:
            self.frames.append(
                {
                    "state": copy.deepcopy(self.state),
                    "note": "Stopped: frame limit reached.",
                    "tag": "limit",
                }
            )
            return
        self.frames.append(
            {"state": copy.deepcopy(self.state), "note": note, "tag": tag}
        )

    def full(self):
        return len(self.frames) > self.max

    def done(self):
        return self.frames
