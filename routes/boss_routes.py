from __future__ import annotations

from flask import Blueprint, current_app, jsonify, render_template

from services import BossApiError, BossService


boss_bp = Blueprint("boss", __name__)


def get_service() -> BossService:
    return BossService(
        api_url=current_app.config["BOSS_API_URL"],
        timeout=current_app.config["BOSS_API_TIMEOUT"],
    )


@boss_bp.get("/")
def index():
    return render_template("index.html")


@boss_bp.get("/api/bosses")
def bosses():
    try:
        data = [boss.to_dict() for boss in get_service().fetch_bosses()]
        return jsonify({"ok": True, "data": data})
    except BossApiError as exc:
        return jsonify({"ok": False, "message": str(exc), "data": []}), 502
