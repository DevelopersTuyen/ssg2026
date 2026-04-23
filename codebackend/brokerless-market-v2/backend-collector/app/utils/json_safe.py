from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from math import isfinite
from typing import Any

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None

try:
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover
    np = None


def to_jsonable(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        return value

    if isinstance(value, float):
        return value if isfinite(value) else None

    if isinstance(value, str):
        return value

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, datetime):
        return value.replace(tzinfo=None).isoformat()

    if isinstance(value, date):
        return value.isoformat()

    if pd is not None:
        if isinstance(value, pd.Timestamp):
            return value.to_pydatetime().replace(tzinfo=None).isoformat()
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass

    if np is not None:
        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            number = float(value)
            return number if isfinite(number) else None
        if isinstance(value, np.bool_):
            return bool(value)
        if isinstance(value, np.ndarray):
            return [to_jsonable(v) for v in value.tolist()]

    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(v) for v in value]

    return str(value)
