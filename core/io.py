from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd


def _read_any(
    path: Union[str, Path],
    delimiter: Optional[str] = None,
    decimal_comma: bool = False,
    no_header: bool = True,
    skiprows: Union[int, Sequence[int]] = 0,
    sheet: Optional[Union[int, str]] = None,
    header_row: Optional[int] = None,
) -> pd.DataFrame:
    """
    Read CSV or Excel robustly.

    Parameters
    ----------
    path : str | Path
        Input filepath (.csv/.txt/.xlsx/.xls/.tsv/.dat supported via pandas).
    delimiter : str | None
        CSV separator. If None, let pandas infer (engine='python').
    decimal_comma : bool
        If True, decimal separator is comma.
    no_header : bool
        Treat file as headerless (every column becomes numeric index).
    skiprows : int | sequence[int]
        Rows to skip *before* header detection (0-based).
    sheet : int | str | None
        Excel sheet index/name (only for Excel).
    header_row : int | None
        Row index for headers (0-based). Ignored if no_header=True.

    Returns
    -------
    pd.DataFrame
    """
    path = Path(path)
    ext = path.suffix.lower()
    decimal = "," if decimal_comma else "."

    # Header handling
    if no_header:
        header = None
    else:
        header = 0 if header_row is None else int(header_row)

    # CSV-like
    if ext in {".csv", ".txt", ".tsv", ".dat"}:
        kwargs = dict(
            header=header,
            skiprows=skiprows,
            decimal=decimal,
            engine="python",  # robust inference
        )
        if delimiter:
            kwargs["sep"] = delimiter
        # If no delimiter, allow pandas to infer; keep thousands=None (default)
        df = pd.read_csv(path, **kwargs)
        return df

    # Excel
    if ext in {".xlsx", ".xls"}:
        df = pd.read_excel(
            path,
            header=header,
            skiprows=skiprows,
            decimal=decimal,
            sheet_name=sheet if sheet is not None else 0,
            engine="openpyxl" if ext == ".xlsx" else None,
        )
        return df

    # Feather / others for convenience (will be used in plot path)
    if ext == ".feather":
        return pd.read_feather(path)

    # NPY (common in your project)
    if ext == ".npy":
        arr = np.load(path, allow_pickle=False)
        if arr.ndim == 1:
            return pd.DataFrame({0: np.arange(arr.size), 1: arr})
        elif arr.ndim == 2 and arr.shape[1] >= 2:
            return pd.DataFrame({0: arr[:, 0], 1: arr[:, 1]})
        raise ValueError(f"Unsupported .npy shape: {arr.shape}")

    raise ValueError(f"Unsupported file extension: {ext}")


def _resolve_col(df: pd.DataFrame, spec: Union[int, str]) -> pd.Series:
    """
    Accepts a column index (int) or name (str). Returns a Series.
    """
    if isinstance(spec, int):
        if spec < 0 or spec >= df.shape[1]:
            raise IndexError(f"Column index {spec} out of bounds for {df.shape[1]} columns")
        return df.iloc[:, spec]
    else:
        if spec not in df.columns:
            raise KeyError(f"Column '{spec}' not found. Available: {list(df.columns)}")
        return df[spec]


def _to_float32(arr_like: Iterable) -> np.ndarray:
    return np.asarray(arr_like, dtype=np.float32)


def _absorbance_to_transmittance(A: np.ndarray) -> np.ndarray:
    """
    Convert absorbance (base-10) to transmittance fraction.
    T = 10^(-A)
    """
    return np.power(10.0, -_to_float32(A))


def _normalize_transmittance(
    y: np.ndarray,
    assume_percent: Optional[bool] = None,
) -> np.ndarray:
    """
    Ensure y is transmittance in *fraction* [0..1].

    Heuristic if assume_percent is None:
      - If max(y) > 1.5 and max(y) <= 120 -> treat as % and divide by 100.
      - Otherwise assume already fraction.
    """
    y = _to_float32(y)
    if assume_percent is True:
        return y / 100.0
    if assume_percent is False:
        return y
    y_max = float(np.nanmax(y))
    if 1.5 < y_max <= 120.0:
        return y / 100.0
    return y


def convert_one(
    input_path: Union[str, Path],
    out_dir: Union[str, Path],
    x_col: Union[int, str] = 0,
    y_col: Union[int, str] = 1,
    *,
    absorbance: bool = False,
    assume_percent: Optional[bool] = None,
    delimiter: Optional[str] = None,
    decimal_comma: bool = False,
    no_header: bool = True,
    skiprows: Union[int, Sequence[int]] = 0,
    sheet: Optional[Union[int, str]] = None,
    header_row: Optional[int] = None,
    output_basename: Optional[str] = None,
) -> Path:
    """
    Convert a single CSV/XLSX/etc. to Feather with columns:
      - 'wavenumbers' (float32)
      - 'transmittance' (float32, fraction 0..1)

    Returns the output path.
    """
    input_path = Path(input_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = _read_any(
        input_path,
        delimiter=delimiter,
        decimal_comma=decimal_comma,
        no_header=no_header,
        skiprows=skiprows,
        sheet=sheet,
        header_row=header_row,
    )

    x = _resolve_col(df, x_col).to_numpy()
    y = _resolve_col(df, y_col).to_numpy()

    # Coerce to float
    x = _to_float32(pd.to_numeric(x, errors="coerce"))
    y = _to_float32(pd.to_numeric(y, errors="coerce"))

    # Drop NaN rows arising from messy headers or blank lines
    mask = ~(np.isnan(x) | np.isnan(y))
    x = x[mask]
    y = y[mask]

    if absorbance:
        y = _absorbance_to_transmittance(y)
    else:
        y = _normalize_transmittance(y, assume_percent=assume_percent)

    out_df = pd.DataFrame(
        {
            "wavenumbers": _to_float32(x),
            "transmittance": _to_float32(y),
        }
    )

    # Keep original order (often descending wavenumbers). Plot code can invert axis visually.
    base = (output_basename or input_path.stem) + ".feather"
    out_path = out_df.to_feather(out_dir / base)
    return out_dir / base


def convert_many(
    inputs: Sequence[Union[str, Path]],
    out_dir: Union[str, Path],
    **kwargs,
) -> List[Path]:
    """
    Batch variant of convert_one(). Returns list of output paths.
    kwargs are forwarded to convert_one().
    """
    outputs: List[Path] = []
    for p in inputs:
        outputs.append(convert_one(p, out_dir, **kwargs))
    return outputs
