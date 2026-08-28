"""저장소 CSV를 Firestore csvText로 밀어 넣는다 (백업 → 비교 → --apply일 때만 쓰기).

어드민 「시나리오 관리 (CSV)」 업로드와 **같은 payload**(csvText + previousCsvText 보관,
`export_utils.build_upload_payload`)를 쓰므로 어드민의 「되돌리기」로 롤백할 수 있다.
그 위에 파일 백업을 한 겹 더 둔다 — DB의 현재 csvText를 아래 디렉터리에 내려받은 뒤에만 쓴다.

    cd syu-react-admin
    venv/bin/python push_csv_to_firestore.py scenarios/visual            # dry-run: 백업 + 차이만
    venv/bin/python push_csv_to_firestore.py scenarios/visual --apply    # 실제 쓰기

문서가 DB에 없으면(예: 첫 시드) previousCsvText 없이 csvText만 만든다.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import tomllib
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import firebase_admin
from firebase_admin import credentials, firestore

from check_csv_sync import DATA_DIR, SECRETS, TARGETS
from export_utils import build_upload_payload

BACKUP_ROOT = Path.home() / "DEV_Mac" / "syu-react-asset-drafts"
KST = ZoneInfo("Asia/Seoul")


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="collection/doc_id — 예: scenarios/visual")
    ap.add_argument("--apply", action="store_true", help="실제로 쓴다 (없으면 dry-run)")
    args = ap.parse_args()

    collection, doc_id = args.target.split("/", 1)
    filename = TARGETS[collection][doc_id]
    local_path = (DATA_DIR / filename).resolve()
    new_csv = local_path.read_text(encoding="utf-8")

    with open(SECRETS, "rb") as f:
        cert = tomllib.load(f)["firebase"]
    firebase_admin.initialize_app(credentials.Certificate(dict(cert)))
    ref = firestore.client().collection(collection).document(doc_id)
    snap = ref.get()

    now = datetime.now(KST)
    stamp = now.strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUP_ROOT / f"{now:%Y-%m-%d}-firestore-backup"

    if snap.exists:
        data = snap.to_dict() or {}
        current_csv = data.get("csvText")
        current_updated = snap.update_time.isoformat() if snap.update_time else None
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f"{filename.rsplit('.', 1)[0]}.csvText.{stamp}.csv"
        backup.write_text(current_csv or "", encoding="utf-8")
        print(f"[백업] {backup}  ({len(current_csv or '')} bytes, sha {sha(current_csv or '')})")
        print(f"[DB]   갱신 {current_updated}, 행 {(current_csv or '').count(chr(10))}")
    else:
        current_csv, current_updated = None, None
        print(f"[DB]   {args.target} 문서 없음 → 첫 시드 (previousCsvText 없이)")

    print(f"[로컬] {local_path.name}  ({len(new_csv)} bytes, sha {sha(new_csv)}, 행 {new_csv.count(chr(10))})")
    if current_csv == new_csv:
        print("동일 — 쓸 것이 없습니다.")
        return 0
    if current_csv:
        cur_lines, new_lines = current_csv.splitlines(), new_csv.splitlines()
        changed = sum(1 for a, b in zip(cur_lines, new_lines) if a != b) + abs(len(cur_lines) - len(new_lines))
        print(f"[차이] 바뀐 줄 {changed} (DB {len(cur_lines)}줄 → 로컬 {len(new_lines)}줄)")

    payload = build_upload_payload(new_csv, current_csv, current_updated)
    if not args.apply:
        print("dry-run — --apply를 붙이면 위 payload로 merge 저장합니다:", sorted(payload))
        return 0
    ref.set(payload, merge=True)
    print(f"[저장] {args.target} ← 로컬 (previousCsvText {'보관' if 'previousCsvText' in payload else '없음'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
