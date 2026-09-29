function validate(schema, value) {
  const errors = [];

  function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  function checkType(t, v) {
    if (t === "object") return isPlainObject(v);
    if (t === "array") return Array.isArray(v);
    if (t === "string") return typeof v === "string";
    if (t === "integer") return typeof v === "number" && Number.isInteger(v);
    if (t === "number") return typeof v === "number";
    if (t === "boolean") return typeof v === "boolean";
    return true;
  }

  function walk(sch, val, path) {
    const t = sch.type;
    if (t !== undefined) {
      if (!checkType(t, val)) {
        errors.push(`${path}: type`);
        return;
      }
    }

    if (Object.prototype.hasOwnProperty.call(sch, "enum")) {
      if (!sch.enum.includes(val)) {
        errors.push(`${path}: enum`);
      }
    }

    if (t === "object" && isPlainObject(val)) {
      const props = sch.properties || {};
      const required = sch.required || [];
      for (const key of required) {
        if (!(key in val)) {
          errors.push(`${path}.${key}: missing`);
        }
      }
      for (const key of Object.keys(val)) {
        if (key in props) {
          walk(props[key], val[key], `${path}.${key}`);
        } else if (sch.additionalProperties === false) {
          errors.push(`${path}.${key}: unexpected`);
        }
      }
    } else if (t === "array" && Array.isArray(val)) {
      const itemsSchema = sch.items;
      if (itemsSchema !== undefined) {
        val.forEach((item, i) => {
          walk(itemsSchema, item, `${path}[${i}]`);
        });
      }
    }
  }

  walk(schema, value, "$");
  return errors.sort();
}
