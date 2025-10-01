from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd


def load_pinv(path: str | Path) -> np.ndarray:
    """
    Load a precomputed pseudo-inverse matrix from .npy (float32/64).
    Shape is (m, n) where n matches the spectrum length.
    """
    arr = np.load(Path(path), allow_pickle=False)
    if arr.ndim != 2:
        raise ValueError(f"A_pinv must be 2D; got shape {arr.shape}")
    return arr


def solve_cls(A_pinv: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Compute least-squares coefficients via a provided pseudo-inverse.

    A_pinv: (m, n)
    y: (n,) or (n,1)
    Returns: (m,)
    """
    A_pinv = np.asarray(A_pinv)
    y = np.asarray(y).reshape(-1)
    if A_pinv.ndim != 2:
        raise ValueError("A_pinv must be 2D")
    m, n = A_pinv.shape
    if y.shape[0] != n:
        raise ValueError(f"Dimension mismatch: A_pinv is (m={m}, n={n}) but y is ({y.shape[0]},)")
    coeffs = A_pinv @ y
    return coeffs


def load_feather_spec(path: str | Path) -> Tuple[np.ndarray, np.ndarray]:
    """
    Load a Feather spectrum (row-per-point) and return (wavenumbers, transmittance) as float32 arrays.
    """
    df = pd.read_feather(Path(path))
    for col in ("wavenumbers", "transmittance"):
        if col not in df.columns:
            raise KeyError(f"Expected column '{col}' not found in {path}")
    x = df["wavenumbers"].to_numpy(dtype=np.float32, copy=False)
    y = df["transmittance"].to_numpy(dtype=np.float32, copy=False)
    return x, y
