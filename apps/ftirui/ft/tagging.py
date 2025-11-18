import random

PLACEHOLDER_TAGS = [
    "FT-IR",
    "NMR",
    "XPS",
    "Abs",
    "MS",
    "XRD",
    "Multiple",
]

MAX_TAGS_PER_CANVAS = 20
MAX_TAG_LENGTH = 32


def generate_placeholder_tags():
    """Return a shuffled slice of placeholder tags for a canvas."""
    choices = PLACEHOLDER_TAGS[:]
    random.shuffle(choices)
    if not choices:
        return []
    count = random.randint(1, min(MAX_TAGS_PER_CANVAS, len(choices)))
    return choices[:count]


def normalize_tags(raw):
    """Coerce user-provided tags into a deduped, length-limited list."""
    if raw is None:
        return None
    if not isinstance(raw, list):
        return None
    normalized = []
    for entry in raw:
        text = (str(entry or "")).strip()
        if not text:
            continue
        if len(text) > MAX_TAG_LENGTH:
            text = text[:MAX_TAG_LENGTH]
        if text not in normalized:
            normalized.append(text)
        if len(normalized) >= MAX_TAGS_PER_CANVAS:
            break
    return normalized
