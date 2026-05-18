from __future__ import annotations

import logging
import os

from flask import Flask

from routes.boss_routes import boss_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.update(
        JSON_AS_ASCII=False,
        BOSS_API_URL=os.getenv("BOSS_API_URL", "https://lunaplus.asia/boss-status/json"),
        BOSS_API_TIMEOUT=float(os.getenv("BOSS_API_TIMEOUT", "8")),
        DISCORD_WEBHOOK_URL=os.getenv("DISCORD_WEBHOOK_URL", ""),
    )

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    app.register_blueprint(boss_bp)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
