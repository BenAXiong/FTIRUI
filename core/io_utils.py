from __future__ import annotations
import hashlib, re, shutil
from pathlib import Path
from datetime import datetime
from jcamp import jcamp_read as read_jdx
from typing import Dict, Any, Tuple

# ----------------------------------------------------------------------
def compute_sha256(path: Path, buf_size: int = 8192) -> str:
    """Return SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(buf_size), b""):
            h.update(chunk)
    return h.hexdigest()

# ----------------------------------------------------------------------
def normalize_ext(path: Path, new_suffix: str = ".jdx") -> Path:
    """Copy file → same folder, but with canonical .jdx extension."""
    target = path.with_suffix(new_suffix)
    if path != target:
        shutil.copy2(path, target)
    return target

# ----------------------------------------------------------------------
def extract_jcamp_header(path: Path) -> Dict[str, str]:               # updated to take care of mssing DELTAX if 2nd type of file
    """
    Read all lines beginning with '##' from the top of the JCAMP file
    and return a dict mapping header keys (no '##') to their values.
    """
    header: Dict[str,str] = {}
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if line.strip().upper().startswith("##XYDATA"):            # stop once we hit the data block
                break
            if not line.startswith("##"):
                continue
            key,val = line[2:].split("=",1)
            header[key.strip()] = val.strip()
    # Fix missing DELTAX by computing it from FIRSTX, LASTX, NPOINTS, XFACTOR
    if "DELTAX" not in header or not header["DELTAX"]:
        firstx = float(header["FIRSTX"].replace(",", "."))
        lastx  = float(header["LASTX"].replace(",", "."))
        npts   = int  (header["NPOINTS"])
        xfact  = float(header.get("XFACTOR", "1.0").replace(",", "."))
        computed_dx = (firstx - lastx) / (npts - 1) / xfact
        header["DELTAX"] = str(computed_dx)
    return header

# ----------------------------------------------------------------------
DATE_RE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{2,4})")

def header_date_iso(rec: Dict[str, Any]) -> str | None:
    """Extract 'DATE' → iso 'YYYYMMDD', else None."""   
    raw = rec.get("DATE")
    if not raw:
        return None
    m = DATE_RE.search(raw)
    if not m:
        return None
    day, month, year = map(int, m.groups())
    if year < 100:
        year += 2000
    return f"{year:04d}{month:02d}{day:02d}"

# ----------------------------------------------------------------------
def derive_sample_id(rec: Dict[str, Any], fallback: str) -> str:
    """Clean up ##TITLE or fallback to file-stem."""
    title = rec.get("TITLE", "") or fallback
    return re.sub(r"[^A-Za-z0-9_-]+", "_", title).strip("_")

# ----------------------------------------------------------------------
def rename_final(src: Path, date_iso: str | None, sample_id: str) -> Path:
    base = f"{date_iso or '00000000'}_{sample_id}.jdx"
    final = src.with_name(base)
    if final != src:
        shutil.move(src, final)
    return final
