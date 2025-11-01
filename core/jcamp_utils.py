from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
from jcamp import jcamp_readfile

from .io_utils import extract_jcamp_header

_DECIMAL_RE = re.compile(r"^(##(?:FIRSTX|LASTX|DELTAX|YFACTOR|NPOINTS))=([0-9]+),([0-9E\-]+)", re.MULTILINE)
_NUMERIC_LIKE = re.compile(r"^[+-]?\d+(?:[.,]\d+)?(?:[eEdD][+-]?\d+)?$")
_IR_BLOCK_MARKER = re.compile(r"\$\$\s*===\s*CHEMSPECTRA SPECTRUM ORIG\s*===")


def _sanitize_jcamp_text(text: str) -> str:
    """Normalise decimal commas on critical header keys."""
    return _DECIMAL_RE.sub(lambda m: f"{m.group(1)}={m.group(2)}.{m.group(3)}", text)


def _extract_ir_block(text: str) -> str:
    """Extract the primary IR block from CHEMSPECTRA LINK files."""
    parts = _IR_BLOCK_MARKER.split(text, maxsplit=1)
    if len(parts) < 2:
        return text
    ir_block = parts[1]
    if not ir_block.lstrip().startswith("##"):
        ir_block = "\n".join(ir_block.splitlines()[1:])
    return ir_block


def _clean_meta_value(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if _NUMERIC_LIKE.match(text):
        text = text.replace(",", ".")
    return text


def _collect_additional_meta(data: Dict) -> Dict[str, str]:
    meta: Dict[str, str] = {}
    for key, value in data.items():
        if key in {"x", "y", "children"}:
            continue
        if isinstance(value, (dict, list, tuple, set)):
            continue
        cleaned = _clean_meta_value(value)
        if cleaned:
            meta[key.upper()] = cleaned
    return meta


def load_jcamp(path: str | Path) -> Tuple[np.ndarray, np.ndarray, Dict[str, str]]:
    """
    Robust JCAMP-DX reader returning (x, y, metadata). The metadata combines
    extracted header values (with numeric strings normalised) and additional
    scalar fields from the parsed JCAMP payload.
    """
    path = Path(path)
    raw = path.read_text(encoding="utf-8", errors="ignore")
    fixed = _extract_ir_block(_sanitize_jcamp_text(raw))

    header = {k.upper(): _clean_meta_value(v) for k, v in extract_jcamp_header(path).items()}

    tf = tempfile.NamedTemporaryFile("w", delete=False, suffix=".dx")
    try:
        tf.write(fixed)
        tf.flush()
        tf.close()

        data = jcamp_readfile(tf.name)
        if isinstance(data, dict) and data.get("children"):
            for child in data["children"]:
                if "x" in child and "y" in child:
                    data = child
                    break

        x = np.asarray((data or {}).get("x", []), dtype=np.float32).ravel()
        y = np.asarray((data or {}).get("y", []), dtype=np.float32).ravel()

        meta = dict(header)
        if isinstance(data, dict):
            meta.update(_collect_additional_meta(data))

        meta.setdefault("TITLE", header.get("TITLE", path.stem))
        meta.setdefault("FILENAME", path.name)
        meta.setdefault("YUNITS_ORIGINAL", meta.get("YUNITS", ""))
        meta["POINT_COUNT"] = str(len(x) or len(y))

        return x, y, meta
    finally:
        try:
            os.unlink(tf.name)
        except Exception:
            pass


def load_jcamp_fixed(path: str | Path) -> Tuple[np.ndarray, np.ndarray, Dict[str, str]]:
    """
    Load JCAMP data with robust axis reconstruction when needed.
    Returns (x, y, metadata).
    """
    x_raw, y_raw, meta = load_jcamp(path)
    meta = dict(meta) if meta else {}
    if meta.get('YUNITS_ORIGINAL') and 'YUNITS' not in meta:
        meta['YUNITS'] = meta['YUNITS_ORIGINAL']

    try:
        npts = int(float(meta.get("NPOINTS", len(x_raw) or len(y_raw) or 0)))
    except Exception:
        npts = len(x_raw) or len(y_raw)

    try:
        firstx = float(meta.get("FIRSTX", "nan"))
    except Exception:
        firstx = float("nan")
    try:
        lastx = float(meta.get("LASTX", "nan"))
    except Exception:
        lastx = float("nan")

    if x_raw.size == 0 or (npts and x_raw.size not in (0, npts)):
        if np.isfinite(firstx) and np.isfinite(lastx) and npts:
            xmin, xmax = sorted([firstx, lastx])
            x = np.linspace(xmax, xmin, npts, dtype=np.float32)
        else:
            x = x_raw.astype(np.float32, copy=False)
    else:
        x = x_raw.astype(np.float32, copy=False)

    y = y_raw.astype(np.float32, copy=False)

    return x, y, meta

