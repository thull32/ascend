def _matches(input_, path):
    if input_ == ".":
        return True
    if input_.endswith("/"):
        return path.startswith(input_)
    return path == input_


def rebuilt_layers(layers, changed):
    first = None
    for i, layer in enumerate(layers):
        if any(_matches(inp, path) for inp in layer["inputs"] for path in changed):
            first = i
            break
    if first is None:
        return []
    return [layers[j]["cmd"] for j in range(first, len(layers))]
