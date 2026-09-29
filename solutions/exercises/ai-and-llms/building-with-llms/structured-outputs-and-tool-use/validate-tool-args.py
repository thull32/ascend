def validate(schema, value):
    errors = []

    def check_type(t, v):
        if t == "object":
            return isinstance(v, dict)
        if t == "array":
            return isinstance(v, list)
        if t == "string":
            return isinstance(v, str)
        if t == "integer":
            return isinstance(v, int) and not isinstance(v, bool)
        if t == "number":
            return isinstance(v, (int, float)) and not isinstance(v, bool)
        if t == "boolean":
            return isinstance(v, bool)
        return True

    def walk(sch, val, path):
        t = sch.get("type")
        if t is not None:
            if not check_type(t, val):
                errors.append(f"{path}: type")
                return

        if "enum" in sch:
            if val not in sch["enum"]:
                errors.append(f"{path}: enum")

        if t == "object" and isinstance(val, dict):
            props = sch.get("properties", {})
            required = sch.get("required", [])
            for key in required:
                if key not in val:
                    errors.append(f"{path}.{key}: missing")
            for key, v in val.items():
                if key in props:
                    walk(props[key], v, f"{path}.{key}")
                elif sch.get("additionalProperties") is False:
                    errors.append(f"{path}.{key}: unexpected")
        elif t == "array" and isinstance(val, list):
            items_schema = sch.get("items")
            if items_schema is not None:
                for i, item in enumerate(val):
                    walk(items_schema, item, f"{path}[{i}]")

    walk(schema, value, "$")
    return sorted(errors)
