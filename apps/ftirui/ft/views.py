from __future__ import annotations

import io
from pathlib import Path
from typing import List, Optional

from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie

import pandas as pd 
import numpy as np

# Matplotlib headless backend
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Import reusable logic from repo-root core/
from core.io import convert_many

BASE_DIR = Path(__file__).resolve().parents[1]          # apps/ftirui
REPO_ROOT = BASE_DIR.parent                              # mlirui/
LOGS_DIR = REPO_ROOT / "logs"
MEDIA_ROOT = Path(settings.MEDIA_ROOT)
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Helper: coerce y to fractional Transmittance [0..1]
def _to_fractional_T(y: np.ndarray) -> np.ndarray:
    y = np.asarray(y, dtype=np.float32)
    if y.size == 0:
        return y
    y_max = float(np.nanmax(y))
    y_med = float(np.nanmedian(y))
    # %T heuristic: clearly above 1
    if 1.5 < y_max <= 120.0:
        return y / 100.0
    # Absorbance heuristic (typical A up to ~5, non-negative)
    if 0.05 <= y_max <= 5.0 and y_med >= 0:
        return np.power(10.0, -y)  # T = 10^-A
    # Otherwise assume already fractional T
    return y

def index(request):
    return render(request, "ft/base.html", {})

@require_http_methods(["POST"])
def preview(request):
    """
    Preview first 30 rows with row numbers. Always treat as headerless here.
    """
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    name = (f.name or "").lower()
    decimal_comma = request.POST.get("decimal_comma") == "true"
    delimiter = request.POST.get("delimiter") or None
    skiprows = int(request.POST.get("skiprows") or 0)
    sheet = request.POST.get("sheet") or None
    # force header=None for robustness
    decimal = "," if decimal_comma else "."

    try:
        if name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(
                f, header=None, skiprows=skiprows, decimal=decimal,
                sheet_name=(sheet if sheet not in (None, "") else 0),
                engine="openpyxl" if name.endswith(".xlsx") else None,
            )
        else:
            # CSV/TSV/TXT: let pandas infer if no delimiter specified
            # CSV-like: wrap bytes as text for pandas
            raw = f.read()
            text = raw.decode("utf-8", errors="ignore")
            fh = io.StringIO(text)
            read_kwargs = dict(header=None, skiprows=skiprows, decimal=decimal, engine="python")
            if delimiter:
                read_kwargs["sep"] = delimiter
            df = pd.read_csv(fh, **read_kwargs)
    except Exception as e:
        return JsonResponse({"error": f"Preview failed: {e}"}, status=400)

    # Limit to first 30 rows
    head = df.iloc[:30, :]
    headings = ["Row"] + [str(i) for i in range(head.shape[1])]
    rows = []
    for idx, row in head.iterrows():
        rows.append([int(idx)] + [None if pd.isna(v) else v for v in row.tolist()])

    return JsonResponse({"headings": headings, "rows": rows})

@require_http_methods(["POST"])
def convert(request):
    """
    Save upload(s) to media/uploads, run core.convert_many, return download links.
    """
    files = request.FILES.getlist("files")
    if not files:
        # also support single 'file'
        one = request.FILES.get("file")
        if one:
            files = [one]
    if not files:
        return JsonResponse({"error": "No files uploaded"}, status=400)

    # Options
    x_col = int(request.POST.get("x_col") or 0)
    y_col = int(request.POST.get("y_col") or 1)
    absorbance = request.POST.get("absorbance") == "true"
    assume_percent = request.POST.get("assume_percent")
    if assume_percent == "true":
        assume_percent = True
    elif assume_percent == "false":
        assume_percent = False
    else:
        assume_percent = None

    delimiter = request.POST.get("delimiter") or None
    decimal_comma = request.POST.get("decimal_comma") == "true"
    no_header = request.POST.get("no_header") != "false"  # default True
    skiprows = int(request.POST.get("skiprows") or 0)
    sheet = request.POST.get("sheet") or None
    header_row = request.POST.get("header_row")
    header_row = int(header_row) if (header_row not in (None, "", "null") and not no_header) else None

    # Persist uploads to disk
    uploads_dir = MEDIA_ROOT / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: List[Path] = []
    for up in files:
        out = uploads_dir / Path(up.name).name
        with open(out, "wb") as h:
            for chunk in up.chunks():
                h.write(chunk)
        saved_paths.append(out)

    # Convert
    converted_dir = MEDIA_ROOT / "converted"
    converted_dir.mkdir(parents=True, exist_ok=True)

    try:
        outputs = convert_many(
            saved_paths,
            converted_dir,
            x_col=x_col,
            y_col=y_col,
            absorbance=absorbance,
            assume_percent=assume_percent,
            delimiter=delimiter,
            decimal_comma=decimal_comma,
            no_header=no_header,
            skiprows=skiprows,
            sheet=sheet,
            header_row=header_row,
        )
    except Exception as e:
        return JsonResponse({"error": f"Conversion failed: {e}"}, status=400)

    links = [f"{settings.MEDIA_URL}converted/{p.name}" for p in outputs]
    return JsonResponse({"outputs": [{"name": p.name, "url": url} for p, url in zip(outputs, links)]})

@require_http_methods(["POST"])
def plot_preview(request):
    """
    Plot from a raw CSV/XLSX upload using the same options as preview/convert.
    Accepts: file, x_col, y_col, delimiter, decimal_comma, skiprows, sheet,
             invert (bool), xmin, xmax (floats or empty)
    Returns: PNG image bytes
    """
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    import io
    name = (f.name or "").lower()
    x_col = int(request.POST.get("x_col") or 0)
    y_col = int(request.POST.get("y_col") or 1)
    delimiter = request.POST.get("delimiter") or None
    decimal_comma = request.POST.get("decimal_comma") == "true"
    skiprows = int(request.POST.get("skiprows") or 0)
    sheet = request.POST.get("sheet") or None
    invert = request.POST.get("invert") == "true"
    xmin = request.POST.get("xmin")
    xmax = request.POST.get("xmax")
    xmin = float(xmin) if (xmin not in (None, "", "auto")) else None
    xmax = float(xmax) if (xmax not in (None, "", "auto")) else None
    decimal = "," if decimal_comma else "."

    # Read into df as in preview:
    try:
        if name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(
                f, header=None, skiprows=skiprows, decimal=decimal,
                sheet_name=(sheet if sheet not in (None, "") else 0),
                engine="openpyxl" if name.endswith(".xlsx") else None,
            )
        else:
            raw = f.read()
            text = raw.decode("utf-8", errors="ignore")
            fh = io.StringIO(text)
            read_kwargs = dict(header=None, skiprows=skiprows, decimal=decimal, engine="python")
            if delimiter:
                read_kwargs["sep"] = delimiter
            df = pd.read_csv(fh, **read_kwargs)
    except Exception as e:
        return JsonResponse({"error": f"Preview plot read failed: {e}"}, status=400)

    if x_col >= df.shape[1] or y_col >= df.shape[1]:
        return JsonResponse({"error": "x_col or y_col out of range for this file"}, status=400)

    x = pd.to_numeric(df.iloc[:, x_col], errors="coerce").to_numpy(dtype=np.float32)
    y = pd.to_numeric(df.iloc[:, y_col], errors="coerce").to_numpy(dtype=np.float32)
    m = ~(np.isnan(x) | np.isnan(y))
    x, y = x[m], y[m]

    y = _to_fractional_T(y)

    fig, ax = plt.subplots(figsize=(7, 3))
    ax.plot(x, y, linewidth=1.0)
    ax.set_xlabel("Wavenumber (cm⁻¹)")
    ax.set_ylabel("Y")

    if invert:
        ax.invert_xaxis()
    if xmin is not None or xmax is not None:
        ax.set_xlim(left=xmin, right=xmax)

    ax.grid(alpha=0.3)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    buf.seek(0)
    return HttpResponse(buf.getvalue(), content_type="image/png")


@require_http_methods(["POST"])
def plot_image(request):
    """
    Accept one or more feather files and return PNG.
    Optional: invert x-axis (invert=true), xmin, xmax.
    """
    files = request.FILES.getlist("file")
    if not files:
        f = request.FILES.get("file")
        if f:
            files = [f]
    if not files:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    invert = request.POST.get("invert") == "true"
    xmin = request.POST.get("xmin")
    xmax = request.POST.get("xmax")
    xmin = float(xmin) if (xmin not in (None, "", "auto")) else None
    xmax = float(xmax) if (xmax not in (None, "", "auto")) else None

    series = []
    errors = []
    for f in files:
        try:
            bio = io.BytesIO(f.read())
            df = pd.read_feather(bio)
            if not {"wavenumbers", "transmittance"}.issubset(df.columns):
                errors.append(f"{f.name}: missing columns")
                continue
            x = df["wavenumbers"].to_numpy(dtype=np.float32)
            y = df["transmittance"].to_numpy(dtype=np.float32)
            series.append((f.name, x, y))
        except Exception as e:
            errors.append(f"{f.name}: {e}")

    if not series:
        return JsonResponse({"error": "Could not read any feather: " + "; ".join(errors)}, status=400)

    fig, ax = plt.subplots(figsize=(7, 3))
    for name, x, y in series:
        ax.plot(x, y, linewidth=1.0, label=name)

    if invert:
        ax.invert_xaxis()
    if xmin is not None or xmax is not None:
        ax.set_xlim(left=xmin, right=xmax)

    ax.set_xlabel("Wavenumber (cm⁻¹)")
    ax.set_ylabel("Transmittance")
    if len(series) > 1:
        ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    buf.seek(0)
    return HttpResponse(buf.getvalue(), content_type="image/png")

@require_http_methods(["GET", "POST"])
def notes(request):
    notes_path = MEDIA_ROOT / "notes.md"
    notes_path.parent.mkdir(parents=True, exist_ok=True)

    if request.method == "GET":
        text = notes_path.read_text(encoding="utf-8") if notes_path.exists() else ""
        return JsonResponse({"text": text})

    # POST: save
    text = request.POST.get("text", "")
    notes_path.write_text(text, encoding="utf-8")
    return JsonResponse({"ok": True})


@require_http_methods(["GET"])
def logs(request):
    """
    Read last N lines from a file in repo-root logs/.
    Params: n (default 200), file (optional filename)
    """
    n = int(request.GET.get("n") or 200)
    name = request.GET.get("file")

    if not LOGS_DIR.exists():
        return JsonResponse({"files": [], "lines": [], "info": "No logs/ folder found."})

    files = sorted([p.name for p in LOGS_DIR.glob("*") if p.is_file()])
    if not files:
        return JsonResponse({"files": [], "lines": [], "info": "No log files present."})

    fname = name if name in files else files[-1]  # pick latest by name if unspecified
    path = LOGS_DIR / fname

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as h:
            lines = h.readlines()
    except Exception as e:
        return JsonResponse({"error": f"Cannot read log: {e}"}, status=400)

    tail = lines[-n:]
    return JsonResponse({"files": files, "file": fname, "lines": tail})