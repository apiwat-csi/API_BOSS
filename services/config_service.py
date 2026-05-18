from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)

DEFAULT_CLIENT_CONFIG = {
    "apiRefreshSeconds": 10,
    "soonBeforeSeconds": 300,
}


def load_client_config(config_path: str | Path) -> dict[str, int]:
    path = Path(config_path)
    config = DEFAULT_CLIENT_CONFIG.copy()

    try:
        raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("Client config file not found: %s", path)
        return config
    except json.JSONDecodeError:
        logger.warning("Client config file contains invalid JSON: %s", path)
        return config

    for key, default_value in DEFAULT_CLIENT_CONFIG.items():
        value = raw.get(key, default_value)
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default_value
        config[key] = max(1, parsed)

    return config
