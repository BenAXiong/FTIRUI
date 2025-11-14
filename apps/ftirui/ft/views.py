from __future__ import annotations

import io
import tempfile
from functools import wraps
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.urls import reverse

import pandas as pd 
import numpy as np
import json

# Matplotlib headless backend
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Import reusable logic from repo-root core/
from core.jcamp_utils import load_jcamp_fixed
from core.io import convert_many
from . import sessions_repository as session_repo
from .models import (
    PlotSession,
    WorkspaceSection,
    WorkspaceProject,
    WorkspaceCanvas,
    WorkspaceCanvasVersion,
)
from .sessions_repository import SessionStorageError, SessionTooLargeError

BASE_DIR = Path(__file__).resolve().parents[1]          # apps/ftirui
REPO_ROOT = BASE_DIR.parent                              # mlirui/
LOGS_DIR = REPO_ROOT / "logs"
MEDIA_ROOT = Path(settings.MEDIA_ROOT)
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR = MEDIA_ROOT / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
DEMOS_DIR = BASE_DIR / "ft" / "static" / "ft" / "demos"

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
    return render(request, "ft/base.html", {"active_canvas": None})


@ensure_csrf_cookie
def workspace_page(request):
    """
    Standalone workspace shell so canvases can open outside the dashboard tabs.
    """
    dev_override = request.GET.get("dev") == "true"
    canvas_id = request.GET.get("canvas")
    canvas = _get_canvas_for_user(request.user, canvas_id) if canvas_id else None
    context = {
        "workspace_only": not dev_override,
        "workspace_pane_active": True,
        "active_canvas": canvas,
    }
    return render(request, "ft/base.html", context)

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

# @require_http_methods(["POST"])
# def plot_preview(request):
#     """
#     Plot from a raw CSV/XLSX upload using the same options as preview/convert.
#     Accepts: file, x_col, y_col, delimiter, decimal_comma, skiprows, sheet,
#              invert (bool), xmin, xmax (floats or empty)
#     Returns: PNG image bytes
#     """
#     f = request.FILES.get("file")
#     if not f:
#         return JsonResponse({"error": "No file uploaded"}, status=400)

#     import io
#     name = (f.name or "").lower()
#     x_col = int(request.POST.get("x_col") or 0)
#     y_col = int(request.POST.get("y_col") or 1)
#     delimiter = request.POST.get("delimiter") or None
#     decimal_comma = request.POST.get("decimal_comma") == "true"
#     skiprows = int(request.POST.get("skiprows") or 0)
#     sheet = request.POST.get("sheet") or None
#     invert = request.POST.get("invert") == "true"
#     xmin = request.POST.get("xmin")
#     xmax = request.POST.get("xmax")
#     xmin = float(xmin) if (xmin not in (None, "", "auto")) else None
#     xmax = float(xmax) if (xmax not in (None, "", "auto")) else None
#     decimal = "," if decimal_comma else "."

#     # Read into df as in preview:
#     try:
#         if name.endswith((".xlsx", ".xls")):
#             df = pd.read_excel(
#                 f, header=None, skiprows=skiprows, decimal=decimal,
#                 sheet_name=(sheet if sheet not in (None, "") else 0),
#                 engine="openpyxl" if name.endswith(".xlsx") else None,
#             )
#         else:
#             raw = f.read()
#             text = raw.decode("utf-8", errors="ignore")
#             fh = io.StringIO(text)
#             read_kwargs = dict(header=None, skiprows=skiprows, decimal=decimal, engine="python")
#             if delimiter:
#                 read_kwargs["sep"] = delimiter
#             df = pd.read_csv(fh, **read_kwargs)
#     except Exception as e:
#         return JsonResponse({"error": f"Preview plot read failed: {e}"}, status=400)

#     if x_col >= df.shape[1] or y_col >= df.shape[1]:
#         return JsonResponse({"error": "x_col or y_col out of range for this file"}, status=400)

#     x = pd.to_numeric(df.iloc[:, x_col], errors="coerce").to_numpy(dtype=np.float32)
#     y = pd.to_numeric(df.iloc[:, y_col], errors="coerce").to_numpy(dtype=np.float32)
#     m = ~(np.isnan(x) | np.isnan(y))
#     x, y = x[m], y[m]

#     y = _to_fractional_T(y)

#     fig, ax = plt.subplots(figsize=(7, 3))
#     ax.plot(x, y, linewidth=1.0)
#     ax.set_xlabel("Wavenumber (cm⁻¹)")
#     ax.set_ylabel("Y")

#     if invert:
#         ax.invert_xaxis()
#     if xmin is not None or xmax is not None:
#         ax.set_xlim(left=xmin, right=xmax)

#     ax.grid(alpha=0.3)
#     fig.tight_layout()
#     buf = io.BytesIO()
#     fig.savefig(buf, format="png", dpi=120)
#     plt.close(fig)
#     buf.seek(0)
#     return HttpResponse(buf.getvalue(), content_type="image/png")


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

def _read_tabular_upload(f, *, delimiter=None, decimal_comma=False, skiprows=0, sheet=None):
    """Read CSV/XLSX/TXT robustly into a headerless DataFrame."""
    name = (getattr(f, "name", "") or "").lower()
    decimal = "," if decimal_comma else "."
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(
            f, header=None, skiprows=int(skiprows or 0), decimal=decimal,
            sheet_name=(sheet if sheet not in (None, "") else 0),
            engine="openpyxl" if name.endswith(".xlsx") else None,
        )
    # CSV/TSV/TXT/JCAMP: read as text
    raw = f.read()
    text = raw.decode("utf-8", errors="ignore")

    snippet = text[:4096].upper()
    if "##JCAMP" in snippet or "##XYDATA" in snippet:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile("wb", delete=False, suffix=".jdx") as tmp:
                tmp.write(raw)
                tmp.flush()
                tmp_path = Path(tmp.name)
            x, y, meta = load_jcamp_fixed(tmp_path)
            df = pd.DataFrame({0: x, 1: y})
            if meta:
                df.attrs["meta"] = meta
            return df
        except Exception as exc:
            raise ValueError(f"JCAMP parse failed: {exc}") from exc
        finally:
            if tmp_path:
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass
    fh = io.StringIO(text)
    kw = dict(header=None, skiprows=int(skiprows or 0), decimal=decimal, engine="python")
    if delimiter:
        kw["sep"] = delimiter
    return pd.read_csv(fh, **kw)

def _coerce_xy(df, x_col=0, y_col=1):
    """Pick numeric x/y columns with NaNs removed."""
    x = pd.to_numeric(df.iloc[:, int(x_col or 0)], errors="coerce").to_numpy(dtype=np.float32)
    y = pd.to_numeric(df.iloc[:, int(y_col or 1)], errors="coerce").to_numpy(dtype=np.float32)
    m = ~(np.isnan(x) | np.isnan(y))
    return x[m], y[m]

def _normalize_input_units(
    y: np.ndarray,
    mode: Optional[str],
    meta: Optional[dict] = None,
) -> tuple[np.ndarray, str]:
    """
    Normalise uploaded Y data into fractional transmittance based on the declared units.

    Returns (converted_y, resolved_mode) where resolved_mode is either "abs" or "tr".
    """
    arr = np.asarray(y, dtype=np.float32)
    if arr.size == 0:
        return arr, "tr"

    def _set_conversion(text: str) -> None:
        if meta is None or not text:
            return
        meta["CONVERSION"] = text

    def _mark_reason(source: str) -> None:
        if meta is None:
            return
        existing = meta.get("CONVERSION_REASON")
        if existing:
            meta["CONVERSION_REASON"] = f"{existing}; {source}"
        else:
            meta["CONVERSION_REASON"] = source

    mode_norm = (mode or "auto").strip().lower()
    manual_abs = mode_norm in {"abs", "absorbance"}
    manual_tr = mode_norm in {"tr", "t", "transmittance"}

    resolved_mode = "tr"
    treat_as_percent = False

    if manual_abs:
        _mark_reason("manual selection (absorbance)")
        converted = np.power(10.0, -arr)
        _set_conversion("Absorbance → Transmittance")
        return converted.astype(np.float32), "abs"

    if manual_tr:
        _mark_reason("manual selection (transmittance)")
        finite = arr[np.isfinite(arr)]
        if finite.size and float(np.max(np.abs(finite))) > 1.5:
            treat_as_percent = True
        if treat_as_percent:
            _set_conversion("Percent → Fraction")
            return (arr / 100.0).astype(np.float32), "tr"
        _set_conversion(meta.get("CONVERSION", "Transmittance (no change)") if meta else "Transmittance (no change)")
        return arr, "tr"

    # --- Auto detection path -------------------------------------------------
    resolved_via_meta = False

    if isinstance(meta, dict):
        def _normalise_value(val: str) -> str:
            txt = str(val or "").strip().upper()
            replacements = {
                "%": " PERCENT ",
                "‰": " PERCENT ",
                "ABS.": "ABS ",
                "ABSORBANCE": "ABSORBANCE",
            }
            for old, new in replacements.items():
                txt = txt.replace(old, new)
            return " ".join(txt.split())

        meta_keys = (
            "INPUT_MODE",
            "YUNITS",
            "YUNITS_ORIGINAL",
            "DATA TYPE",
            "DATATYPE",
            "UNITS",
            "Y_LABEL",
            "YLABEL",
        )
        for key in meta_keys:
            raw_val = meta.get(key)
            if not raw_val:
                continue
            token = _normalise_value(raw_val)
            if "ABS" in token or "LOG(1/R)" in token or "LOG1/R" in token:
                resolved_mode = "abs"
                resolved_via_meta = True
                _mark_reason(f"metadata {key}={raw_val}")
                break
            if "TRANSM" in token or "T%" in token or "PERCENT T" in token or "PERCENT" in token:
                resolved_mode = "tr"
                resolved_via_meta = True
                treat_as_percent = "PERCENT" in token or "T%" in token
                _mark_reason(f"metadata {key}={raw_val}")
                break

    if not resolved_via_meta:
        finite = arr[np.isfinite(arr)]
        if finite.size == 0:
            finite = arr
        if finite.size:
            y_max = float(np.nanmax(finite))
            y_med = float(np.nanmedian(finite))
            if 0 <= y_med and 0.05 <= y_max <= 5.0:
                resolved_mode = "abs"
                _mark_reason("heuristic magnitude (absorbance-like)")
            elif y_max > 1.5:
                resolved_mode = "tr"
                treat_as_percent = y_max <= 120.0
                if treat_as_percent:
                    _mark_reason("heuristic magnitude (percent transmittance)")
                else:
                    _mark_reason("heuristic magnitude (fractional transmittance)")
            else:
                resolved_mode = "tr"
                _mark_reason("heuristic default (fractional transmittance)")

    if resolved_mode == "abs":
        _set_conversion("Absorbance → Transmittance")
        converted = np.power(10.0, -arr)
        return converted.astype(np.float32), "abs"

    if treat_as_percent:
        _set_conversion("Percent → Fraction")
        return (arr / 100.0).astype(np.float32), "tr"

    _set_conversion(meta.get("CONVERSION", "Transmittance (no change)") if meta else "Transmittance (no change)")
    return arr, "tr"


def _stringify_meta(meta) -> dict[str, str]:
    if not isinstance(meta, dict):
        return {}
    result: dict[str, str] = {}
    for key, value in meta.items():
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        result[str(key).upper()] = text
    return result

def _json_body(request):
    try:
        raw = request.body.decode("utf-8")
    except Exception:
        raw = ""
    raw = raw or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc

def _isoformat(value):
    if not value:
        return None
    return timezone.localtime(value).isoformat()

def _serialize_canvas(canvas):
    return {
        "id": str(canvas.id),
        "project_id": str(canvas.project_id),
        "title": canvas.title,
        "is_favorite": bool(getattr(canvas, "is_favorite", False)),
        "thumbnail_url": canvas.thumbnail_url,
        "version_label": canvas.version_label,
        "state_size": canvas.state_size,
        "updated": _isoformat(canvas.updated_at),
        "created": _isoformat(canvas.created_at),
    }

def _serialize_project(project, *, include_canvases=False):
    data = {
        "id": str(project.id),
        "section_id": str(project.section_id),
        "title": project.title,
        "summary": project.summary,
        "cover_thumbnail": project.cover_thumbnail,
        "position": project.position,
        "updated": _isoformat(project.updated_at),
        "canvas_count": project.canvases.count(),
    }
    if include_canvases:
        data["canvases"] = [_serialize_canvas(canvas) for canvas in project.canvases.order_by("-updated_at")]
    return data

def _serialize_section(section, *, include_projects=False):
    data = {
        "id": str(section.id),
        "name": section.name,
        "description": section.description,
        "color": section.color,
        "position": section.position,
        "is_pinned": bool(getattr(section, "is_pinned", False)),
        "created": _isoformat(section.created_at),
        "updated": _isoformat(section.updated_at),
    }
    if include_projects:
        projects = section.projects.select_related("section").prefetch_related("canvases")
        data["projects"] = [
            _serialize_project(project, include_canvases=True)
            for project in projects.order_by("position", "created_at")
        ]
    return data

def _compute_state_size(state):
    if not isinstance(state, dict):
        state = {}
    size, _ = session_repo._serialise_state(state)
    return state, size

def _next_position(queryset):
    last = queryset.order_by("-position").first()
    return (last.position + 1) if last else 1

def _require_json_auth(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)
        return view_func(request, *args, **kwargs)
    return _wrapped


def _build_login_urls(request, *, next_path: str) -> dict[str, str]:
    base_next = next_path or request.GET.get("next") or request.path
    login_url = settings.LOGIN_URL
    if hasattr(settings, "LOGOUT_URL"):
        logout_url = settings.LOGOUT_URL
    else:
        try:
            logout_url = reverse("logout")
        except Exception:  # pragma: no cover
            logout_url = "/accounts/logout/"
    if base_next:
        sep_login = "&" if "?" in login_url else "?"
        sep_logout = "&" if "?" in logout_url else "?"
        login_target = f"{login_url}{sep_login}next={quote(base_next)}"
        logout_target = f"{logout_url}{sep_logout}next={quote(base_next)}"
    else:
        login_target = login_url
        logout_target = logout_url
    return {
        "login": login_target,
        "logout": logout_target,
    }

def _get_section_for_user(user, section_id):
    try:
        return WorkspaceSection.objects.get(owner=user, id=section_id)
    except WorkspaceSection.DoesNotExist:
        return None

def _get_project_for_user(user, project_id):
    try:
        return WorkspaceProject.objects.get(owner=user, id=project_id)
    except WorkspaceProject.DoesNotExist:
        return None

def _get_canvas_for_user(user, canvas_id):
    try:
        return WorkspaceCanvas.objects.get(owner=user, id=canvas_id)
    except WorkspaceCanvas.DoesNotExist:
        return None

@require_http_methods(["GET", "POST"])
@_require_json_auth
def api_dashboard_sections(request):
    user = request.user
    if request.method == "GET":
        include = request.GET.get("include") == "full"
        sections = WorkspaceSection.objects.filter(owner=user).order_by("-is_pinned", "position", "created_at")
        return JsonResponse(
            {"items": [_serialize_section(section, include_projects=include) for section in sections]}
        )
    # POST
    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    name = (payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "'name' is required"}, status=400)

    position = payload.get("position")
    if not isinstance(position, int):
        position = _next_position(WorkspaceSection.objects.filter(owner=user))

    section = WorkspaceSection.objects.create(
        owner=user,
        name=name,
        description=payload.get("description") or "",
        color=payload.get("color") or "",
        position=max(position, 0),
    )
    return JsonResponse(_serialize_section(section, include_projects=True), status=201)

@require_http_methods(["PATCH", "DELETE"])
@_require_json_auth
def api_dashboard_section_detail(request, section_id):
    user = request.user
    section = _get_section_for_user(user, section_id)
    if not section:
        return JsonResponse({"error": "Section not found"}, status=404)

    if request.method == "DELETE":
        section.delete()
        return HttpResponse(status=204)

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    update_fields = []
    if "name" in payload:
        new_name = (payload.get("name") or "").strip()
        if not new_name:
            return JsonResponse({"error": "'name' cannot be empty"}, status=400)
        section.name = new_name
        update_fields.append("name")
    if "description" in payload:
        section.description = payload.get("description") or ""
        update_fields.append("description")
    if "color" in payload:
        section.color = payload.get("color") or ""
        update_fields.append("color")
    if "position" in payload and isinstance(payload.get("position"), int):
        section.position = max(payload["position"], 0)
        update_fields.append("position")
    if "is_pinned" in payload:
        section.is_pinned = bool(payload.get("is_pinned"))
        update_fields.append("is_pinned")

    if update_fields:
        update_fields.append("updated_at")
        section.save(update_fields=update_fields)
    return JsonResponse(_serialize_section(section, include_projects=True))

@require_http_methods(["GET", "POST"])
@_require_json_auth
def api_dashboard_section_projects(request, section_id):
    user = request.user
    section = _get_section_for_user(user, section_id)
    if not section:
        return JsonResponse({"error": "Section not found"}, status=404)

    if request.method == "GET":
        projects = section.projects.prefetch_related("canvases").order_by("position", "created_at")
        return JsonResponse({"items": [_serialize_project(project, include_canvases=True) for project in projects]})

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    title = (payload.get("title") or "").strip()
    if not title:
        return JsonResponse({"error": "'title' is required"}, status=400)

    position = payload.get("position")
    if not isinstance(position, int):
        position = _next_position(section.projects.all())

    project = WorkspaceProject.objects.create(
        owner=user,
        section=section,
        title=title,
        summary=payload.get("summary") or "",
        cover_thumbnail=payload.get("cover_thumbnail") or "",
        position=max(position, 0),
    )
    return JsonResponse(_serialize_project(project, include_canvases=True), status=201)

@require_http_methods(["GET", "PATCH", "DELETE"])
@_require_json_auth
def api_dashboard_project_detail(request, project_id):
    user = request.user
    project = _get_project_for_user(user, project_id)
    if not project:
        return JsonResponse({"error": "Project not found"}, status=404)

    if request.method == "GET":
        project = WorkspaceProject.objects.prefetch_related("canvases").get(id=project.id)
        return JsonResponse(_serialize_project(project, include_canvases=True))

    if request.method == "DELETE":
        project.delete()
        return HttpResponse(status=204)

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    update_fields = []
    if "title" in payload:
        new_title = (payload.get("title") or "").strip()
        if not new_title:
            return JsonResponse({"error": "'title' cannot be empty"}, status=400)
        project.title = new_title
        update_fields.append("title")
    if "summary" in payload:
        project.summary = payload.get("summary") or ""
        update_fields.append("summary")
    if "cover_thumbnail" in payload:
        project.cover_thumbnail = payload.get("cover_thumbnail") or ""
        update_fields.append("cover_thumbnail")
    if "position" in payload and isinstance(payload.get("position"), int):
        project.position = max(payload["position"], 0)
        update_fields.append("position")
    if "section_id" in payload:
        new_section = _get_section_for_user(user, payload["section_id"])
        if not new_section:
            return JsonResponse({"error": "Target section not found"}, status=404)
        project.section = new_section
        update_fields.append("section")

    if update_fields:
        update_fields.append("updated_at")
        project.save(update_fields=update_fields)
    return JsonResponse(_serialize_project(project, include_canvases=True))

@require_http_methods(["GET", "POST"])
@_require_json_auth
def api_dashboard_project_canvases(request, project_id):
    user = request.user
    project = _get_project_for_user(user, project_id)
    if not project:
        return JsonResponse({"error": "Project not found"}, status=404)

    if request.method == "GET":
        canvases = project.canvases.order_by("-updated_at")
        return JsonResponse({"items": [_serialize_canvas(canvas) for canvas in canvases]})

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    title = (payload.get("title") or "").strip() or "Untitled canvas"
    raw_state = payload.get("state")
    if raw_state is None:
        raw_state = {}
    state, state_size = _compute_state_size(raw_state if isinstance(raw_state, dict) else {})

    canvas = WorkspaceCanvas.objects.create(
        owner=user,
        project=project,
        title=title,
        state_json=state,
        state_size=state_size,
        thumbnail_url=payload.get("thumbnail_url") or "",
        version_label=payload.get("version_label") or "",
        autosave_token=payload.get("autosave_token") or "",
    )
    return JsonResponse(_serialize_canvas(canvas), status=201)

@require_http_methods(["GET", "PATCH", "DELETE"])
@_require_json_auth
def api_dashboard_canvas_detail(request, canvas_id):
    user = request.user
    canvas = _get_canvas_for_user(user, canvas_id)
    if not canvas:
        return JsonResponse({"error": "Canvas not found"}, status=404)

    if request.method == "GET":
        data = _serialize_canvas(canvas)
        data["project"] = _serialize_project(canvas.project, include_canvases=False)
        return JsonResponse(data)

    if request.method == "DELETE":
        canvas.delete()
        return HttpResponse(status=204)

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    update_fields = []
    if "title" in payload:
        canvas.title = (payload.get("title") or "").strip() or canvas.title
        update_fields.append("title")
    if "thumbnail_url" in payload:
        canvas.thumbnail_url = payload.get("thumbnail_url") or ""
        update_fields.append("thumbnail_url")
    if "version_label" in payload:
        canvas.version_label = payload.get("version_label") or ""
        update_fields.append("version_label")
    if "is_favorite" in payload:
        canvas.is_favorite = bool(payload.get("is_favorite"))
        update_fields.append("is_favorite")
    if "project_id" in payload:
        new_project = _get_project_for_user(user, payload["project_id"])
        if not new_project:
            return JsonResponse({"error": "Target project not found"}, status=404)
        canvas.project = new_project
        update_fields.append("project")

    if update_fields:
        update_fields.append("updated_at")
        canvas.save(update_fields=update_fields)
    return JsonResponse(_serialize_canvas(canvas))

@require_http_methods(["GET", "PUT"])
@_require_json_auth
def api_dashboard_canvas_state(request, canvas_id):
    user = request.user
    canvas = _get_canvas_for_user(user, canvas_id)
    if not canvas:
        return JsonResponse({"error": "Canvas not found"}, status=404)

    if request.method == "GET":
        return JsonResponse(
            {
                "id": str(canvas.id),
                "title": canvas.title,
                "state": canvas.state_json,
                "state_size": canvas.state_size,
                "version_label": canvas.version_label,
                "thumbnail_url": canvas.thumbnail_url,
            }
        )

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    raw_state = payload.get("state")
    if not isinstance(raw_state, dict):
        return JsonResponse({"error": "'state' must be an object"}, status=400)

    state, size = _compute_state_size(raw_state)
    canvas.state_json = state
    canvas.state_size = size
    canvas.version_label = payload.get("version_label") or canvas.version_label
    if "thumbnail_url" in payload:
        canvas.thumbnail_url = payload.get("thumbnail_url") or ""
    canvas.autosave_token = payload.get("autosave_token") or canvas.autosave_token
    canvas.save(update_fields=["state_json", "state_size", "version_label", "thumbnail_url", "autosave_token", "updated_at"])
    return JsonResponse(_serialize_canvas(canvas))

@require_http_methods(["GET", "POST"])
@_require_json_auth
def api_dashboard_canvas_versions(request, canvas_id):
    user = request.user
    canvas = _get_canvas_for_user(user, canvas_id)
    if not canvas:
        return JsonResponse({"error": "Canvas not found"}, status=404)

    if request.method == "GET":
        versions = canvas.versions.order_by("-created_at")
        data = [
            {
                "id": str(version.id),
                "label": version.label,
                "notes": version.notes,
                "state_size": version.state_size,
                "thumbnail_url": version.thumbnail_url,
                "created": _isoformat(version.created_at),
            }
            for version in versions
        ]
        return JsonResponse({"items": data})

    try:
        payload = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    state = payload.get("state")
    if state is None:
        state = canvas.state_json
    if not isinstance(state, dict):
        return JsonResponse({"error": "'state' must be an object"}, status=400)
    state, state_size = _compute_state_size(state)

    version = WorkspaceCanvasVersion.objects.create(
        canvas=canvas,
        created_by=user,
        label=payload.get("label") or canvas.version_label or "",
        notes=payload.get("notes") or "",
        state_json=state,
        state_size=state_size,
        thumbnail_url=payload.get("thumbnail_url") or canvas.thumbnail_url,
    )
    return JsonResponse(
        {
            "id": str(version.id),
            "label": version.label,
            "notes": version.notes,
            "state_size": version.state_size,
            "thumbnail_url": version.thumbnail_url,
            "created": _isoformat(version.created_at),
        },
        status=201,
    )

@require_http_methods(["GET"])
@_require_json_auth
def api_dashboard_canvas_version_detail(request, canvas_id, version_id):
    user = request.user
    canvas = _get_canvas_for_user(user, canvas_id)
    if not canvas:
        return JsonResponse({"error": "Canvas not found"}, status=404)
    try:
        version = canvas.versions.get(id=version_id)
    except WorkspaceCanvasVersion.DoesNotExist:
        return JsonResponse({"error": "Snapshot not found"}, status=404)
    return JsonResponse(
        {
            "id": str(version.id),
            "label": version.label,
            "notes": version.notes,
            "state": version.state_json,
            "state_size": version.state_size,
            "thumbnail_url": version.thumbnail_url,
            "created": _isoformat(version.created_at),
        }
    )


@require_http_methods(["GET"])
def api_me(request):
    user = get_user(request)
    urls = _build_login_urls(request, next_path=request.GET.get("next") or "/")
    if not user.is_authenticated:
        return JsonResponse(
            {
                "authenticated": False,
                "login_url": urls["login"],
                "logout_url": urls["logout"],
            }
        )

    email = (getattr(user, "email", "") or "").strip().lower()
    avatar_url = None
    if email:
        import hashlib

        digest = hashlib.md5(email.encode("utf-8")).hexdigest()
        avatar_url = f"https://www.gravatar.com/avatar/{digest}?s=96&d=identicon"

    session_count = PlotSession.objects.filter(owner=user).count()
    return JsonResponse(
        {
            "authenticated": True,
            "username": getattr(user, "get_full_name", lambda: user.get_username())() or user.get_username(),
            "email": email,
            "avatar": avatar_url,
            "session_count": session_count,
            "login_url": urls["login"],
            "logout_url": urls["logout"],
        }
    )

# --- REPLACE old preview() with this JSON-contract version ---
@require_http_methods(["POST"])
def preview_json(request):
    """
    Returns a small table preview with a flat, front-end-friendly shape:
    {
      "columns": ["col0","col1",...],
      "rows": [{"col0": v, "col1": v2, ...}, ...]
    }
    """
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    try:
        df = _read_tabular_upload(
            f,
            delimiter=request.POST.get("delimiter") or None,
            decimal_comma=(request.POST.get("decimal_comma") == "true"),
            skiprows=request.POST.get("skiprows") or 0,
            sheet=request.POST.get("sheet") or None,
        )
    except Exception as e:
        return JsonResponse({"error": f"Preview failed: {e}"}, status=400)

    head = df.iloc[:30, :].copy()
    cols = [f"col{i}" for i in range(head.shape[1])]
    head.columns = cols
    # map rows to list[dict]
    rows = []
    for _, r in head.iterrows():
        rows.append({c: (None if pd.isna(v) else v) for c, v in r.items()})

    return JsonResponse({"columns": cols, "rows": rows})

# --- NEW: /data JSON for Plotly ---
@require_http_methods(["POST"])
def api_xy(request):
    """
    Parse an uploaded file and return numeric x/y arrays for the interactive trace browser.
    Supports the same column + delimiter options as the other upload endpoints.
    """
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    raw_name = getattr(f, "name", "trace.dat")
    explicit_title = request.POST.get("title")
    display_name = (explicit_title or "").strip()
    try:
        df = _read_tabular_upload(
            f,
            delimiter=request.POST.get("delimiter") or None,
            decimal_comma=(request.POST.get("decimal_comma") == "true"),
            skiprows=request.POST.get("skiprows") or 0,
            sheet=request.POST.get("sheet") or None,
        )
    except Exception as e:
        return JsonResponse({"error": f"Read failed: {e}"}, status=400)

    try:
        x, y = _coerce_xy(df, request.POST.get("x_col") or 0, request.POST.get("y_col") or 1)
    except Exception as e:
        return JsonResponse({"error": f"Column selection failed: {e}"}, status=400)

    meta_dict = _stringify_meta(getattr(df, "attrs", {}).get("meta") if hasattr(df, "attrs") else None)
    mode_raw = request.POST.get("input_units")
    y, resolved_mode = _normalize_input_units(y, mode_raw, meta=meta_dict)

    finite = np.isfinite(x) & np.isfinite(y)
    x = x[finite]
    y = y[finite]
    meta_dict["POINT_COUNT"] = str(int(x.size))

    if x.size == 0 or y.size == 0:
        return JsonResponse({"error": "No numeric samples detected"}, status=400)

    mode_label = "Absorbance" if resolved_mode == "abs" else "Transmittance"
    meta_dict["INPUT_MODE"] = mode_label
    meta_dict.setdefault("DISPLAY_UNITS", "Transmittance")
    if "YUNITS" not in meta_dict and meta_dict.get("YUNITS_ORIGINAL"):
        meta_dict["YUNITS"] = meta_dict["YUNITS_ORIGINAL"]
    meta_dict.setdefault("FILENAME", Path(raw_name).name)

    if not display_name:
        title_meta = (meta_dict.get("TITLE") or meta_dict.get("SAMPLE") or "").strip()
        if title_meta:
            display_name = title_meta
    if not display_name:
        display_name = Path(raw_name).name or "trace"

    return JsonResponse({
        "x": x.astype(float).tolist(),
        "y": y.astype(float).tolist(),
        "name": display_name,
        "meta": meta_dict,
        "ingest_mode": resolved_mode,
    })

@require_http_methods(["POST"])
def data_json(request):
    """
    Accept an uploaded data file (CSV/XLSX/TXT), parse, and return minimal Plotly JSON:
    {
      "traces": [{"name":"Spectrum","x":[...],"y":[...],"mode":"lines"}],
      "layout": { ... }
    }
    Options (POST form fields): x_col, y_col, delimiter, decimal_comma, skiprows, sheet, invert, title
    """
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    try:
        df = _read_tabular_upload(
            f,
            delimiter=request.POST.get("delimiter") or None,
            decimal_comma=(request.POST.get("decimal_comma") == "true"),
            skiprows=request.POST.get("skiprows") or 0,
            sheet=request.POST.get("sheet") or None,
        )
    except Exception as e:
        return JsonResponse({"error": f"Read failed: {e}"}, status=400)

    try:
        x, y = _coerce_xy(df, request.POST.get("x_col") or 0, request.POST.get("y_col") or 1)
        y = _to_fractional_T(y)
    except Exception as e:
        return JsonResponse({"error": f"Column selection failed: {e}"}, status=400)

    invert = (request.POST.get("invert") == "true")
    title  = request.POST.get("title") or "FT-IR"
    traces = [{
        "name": "Spectrum",
        "x": x.tolist(),
        "y": y.tolist(),
        "mode": "lines",
        "type": "scatter",
    }]

    layout = {
        "title": {"text": title},
        "xaxis": {
            "title": {"text": "Wavenumber (cm⁻¹)"},
            "showspikes": True,
            "spikemode": "across",
            "spikesnap": "cursor",
            "autorange": "reversed" if invert else True,
        },
        "yaxis": {
            "title": {"text": "Transmittance"},
            "showspikes": True,
            "spikemode": "across",
            "spikesnap": "cursor",
        },
        "margin": {"l": 48, "r": 24, "t": 48, "b": 48},
        "hovermode": "x",
    }

    return JsonResponse({"traces": traces, "layout": layout})

# --- NEW: optional server-side PNG export (/export/png) ---
@require_http_methods(["POST"])
def export_png(request):
    """
    Server "paper-ready" export.
    Accept either:
      - JSON body: {"x":[...],"y":[...],"invert":true,"title":"...","width":1200,"height":600,"dpi":200}
      - or an uploaded file + the same form options as /data.
    Returns PNG bytes.
    """
    x = y = None
    invert = False
    title = "FT-IR"
    width = int(request.POST.get("width") or 1200)
    height = int(request.POST.get("height") or 600)
    dpi = int(request.POST.get("dpi") or 200)

    # Try JSON body first
    if request.content_type and "application/json" in request.content_type:
        try:
            body = json.loads(request.body.decode("utf-8"))
            x = np.asarray(body.get("x") or [], dtype=np.float32)
            y = np.asarray(body.get("y") or [], dtype=np.float32)
            invert = bool(body.get("invert", False))
            title = body.get("title") or title
            width = int(body.get("width") or width)
            height = int(body.get("height") or height)
            dpi = int(body.get("dpi") or dpi)
        except Exception:
            return JsonResponse({"error": "Invalid JSON body"}, status=400)

    # Fallback: read from uploaded file
    if x is None or y is None or x.size == 0 or y.size == 0:
        f = request.FILES.get("file")
        if not f:
            return JsonResponse({"error": "Provide JSON x/y or upload a file"}, status=400)
        try:
            df = _read_tabular_upload(
                f,
                delimiter=request.POST.get("delimiter") or None,
                decimal_comma=(request.POST.get("decimal_comma") == "true"),
                skiprows=request.POST.get("skiprows") or 0,
                sheet=request.POST.get("sheet") or None,
            )
            x, y = _coerce_xy(df, request.POST.get("x_col") or 0, request.POST.get("y_col") or 1)
            y = _to_fractional_T(y)
            invert = (request.POST.get("invert") == "true")
            title = request.POST.get("title") or title
        except Exception as e:
            return JsonResponse({"error": f"Read failed: {e}"}, status=400)

    # Render Matplotlib “publication style” PNG
    fig_w = width / dpi
    fig_h = height / dpi
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)
    ax.plot(x, y, linewidth=1.2)
    ax.set_title(title)
    ax.set_xlabel("Wavenumber (cm⁻¹)")
    ax.set_ylabel("Transmittance")
    if invert:
        ax.invert_xaxis()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi)
    plt.close(fig)
    buf.seek(0)
    return HttpResponse(buf.getvalue(), content_type="image/png")

# --- Sessions API for interface B -------------------------------------------
@require_http_methods(["POST"])
@_require_json_auth
def api_session_create(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    state = payload.get("state")
    if not isinstance(state, dict):
        return JsonResponse({"error": "'state' must be an object"}, status=400)

    title = str(payload.get("title") or "").strip()

    try:
        session = session_repo.create_session(request.user, title, state)
    except SessionTooLargeError as exc:
        return JsonResponse({"error": str(exc)}, status=413)
    except SessionStorageError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception as exc:  # pragma: no cover - unexpected failure
        return JsonResponse({"error": f"Failed to save session: {exc}"}, status=500)

    return JsonResponse(
        {
            "session_id": str(session.id),
            "title": session.title,
            "size": session.state_size,
            "storage": session.storage_backend,
        },
        status=201,
    )

@require_http_methods(["GET"])
@_require_json_auth
def api_session_list(request):
    items: List[dict] = []
    for row in session_repo.list_sessions(request.user):
        updated = row.get("updated_at")
        items.append({
            "session_id": str(row["id"]),
            "title": row.get("title") or "",
            "updated": updated.isoformat() if updated else None,
            "size": row.get("state_size", 0),
            "storage": row.get("storage_backend", "db"),
        })
    return JsonResponse({"items": items})

@require_http_methods(["GET", "PUT", "DELETE"])
@_require_json_auth
def api_session_get(request, session_id):
    sid = str(session_id)

    if request.method == "DELETE":
        try:
            session_repo.delete_session(request.user, sid)
        except PlotSession.DoesNotExist:
            return JsonResponse({"error": "Session not found"}, status=404)
        return HttpResponse(status=204)

    if request.method == "GET":
        try:
            session = session_repo.get_session(request.user, sid)
        except PlotSession.DoesNotExist:
            return JsonResponse({"error": "Session not found"}, status=404)
        return JsonResponse({
            "session_id": sid,
            "title": session.title or "",
            "state": session.state_json or {},
            "updated": session.updated_at.isoformat() if session.updated_at else None,
            "size": session.state_size,
            "storage": session.storage_backend,
        })

    # PUT
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    state = payload.get("state")
    if not isinstance(state, dict):
        return JsonResponse({"error": "'state' must be an object"}, status=400)
    title = str(payload.get("title") or "").strip()

    try:
        session = session_repo.update_session(request.user, sid, title, state)
    except PlotSession.DoesNotExist:
        return JsonResponse({"error": "Session not found"}, status=404)
    except SessionTooLargeError as exc:
        return JsonResponse({"error": str(exc)}, status=413)
    except SessionStorageError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse(
        {"session_id": sid, "title": session.title, "size": session.state_size, "storage": session.storage_backend}
    )

# --- Demo file discovery -----------------------------------------------------
@require_http_methods(["GET"])
def api_demo_files(request):
    if not DEMOS_DIR.exists():
        return JsonResponse({"files": []})

    static_root = (settings.STATIC_URL or "/static/").rstrip("/")
    files = [
        f"{static_root}/ft/demos/{quote(path.name)}"
        for path in sorted(DEMOS_DIR.glob("*"))
        if path.is_file()
    ]
    return JsonResponse({"files": files})

