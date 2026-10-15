"""Compare decoded native screenshot pixels; requires the local Pillow tool."""

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image


def compare(actual_path, reference_path):
    with Image.open(actual_path) as actual_image, Image.open(reference_path) as reference_image:
        actual = actual_image.convert("RGBA")
        reference = reference_image.convert("RGBA")
    if actual.size != reference.size:
        raise ValueError(f"Screenshot dimensions differ: {actual.size} != {reference.size}")
    differences = [
        {"x": x, "y": y, "actual": actual.getpixel((x, y)), "reference": reference.getpixel((x, y))}
        for y in range(actual.height)
        for x in range(actual.width)
        if actual.getpixel((x, y)) != reference.getpixel((x, y))
    ]
    return {
        "actual": str(actual_path),
        "reference": str(reference_path),
        "width": actual.width,
        "height": actual.height,
        "differentPixels": len(differences),
        "firstDifferences": differences[:10],
        "actualRgbaSha256": hashlib.sha256(actual.tobytes()).hexdigest(),
        "referenceRgbaSha256": hashlib.sha256(reference.tobytes()).hexdigest(),
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 compare-pixels.py <actual.png> <reference.png>")
    result = compare(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps(result))
    raise SystemExit(1 if result["differentPixels"] else 0)
