import unicodedata


def _slugify(text):
    text = text.lower()
    out = []
    for c in text:
        if c == " " or c == "-":
            out.append("-")
            continue
        cat = unicodedata.category(c)
        if cat[0] in ("L", "M") or cat in ("Nd", "Nl", "Pc"):
            out.append(c)
    return "".join(out)


def heading_ids(headings):
    ids = []
    counts = {}
    taken = set()

    for heading in headings:
        slug = _slugify(heading)
        candidate = slug
        if candidate in taken:
            n = counts.get(slug, 0) + 1
            candidate = f"{slug}-{n}"
            while candidate in taken:
                n += 1
                candidate = f"{slug}-{n}"
            counts[slug] = n
        taken.add(candidate)
        ids.append(candidate)

    return ids
