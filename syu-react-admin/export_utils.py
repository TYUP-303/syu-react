# export_utils.py
# 연구용 데이터 내보내기 · CSV 버전 보관(롤백)의 순수 함수 모듈.
#
# csv_validation.py와 같은 계약이다 — Streamlit·firebase_admin 의존성이 없어
# pytest로 직접 호출해 검증한다. streamlit_app.py는 화면과 Firestore I/O만 맡고
# 마스킹·플랫화·버전 스왑 같은 판단은 전부 여기에 둔다.
#
# ── users/{uid} 스키마 출처 ───────────────────────────────────────
# 필드 이름은 프론트엔드 src/api/firestoreKeys.ts의 USER_FIELDS와 미러 관계다.
# 값의 의미는 아래 세 곳에서 확인한 것이며, 추측한 필드는 없다:
#   adhdResult / stressResult → src/store/useTestStore.ts (TestResultData)
#   scenarios[episodeId]      → src/store/useScenarioStore.ts (EpisodeProgress)
#   완주·전략 집계 규칙        → src/utils/strategyStats.ts (computeStrategyStats)
# 프론트 쪽 필드를 바꾸면 여기도 함께 고쳐야 한다.

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pandas as pd

KST = timezone(timedelta(hours=9))

# ── Firestore 필드명 (프론트 firestoreKeys.ts와 미러) ──────────────
CSV_TEXT_FIELD = "csvText"
PREVIOUS_CSV_TEXT_FIELD = "previousCsvText"
PREVIOUS_UPDATED_AT_FIELD = "previousUpdatedAt"

# ── 스트레스 8유형 라벨 (constants/reactionType.ts와 미러) ──────────
STRESS_RESULT_TYPE_LABEL = {
    "cognitive": "인지형",
    "emotional": "정서형",
    "behavioral": "행동형",
    "cognitive-emotional": "인지·정서형",
    "cognitive-behavioral": "인지·행동형",
    "emotional-behavioral": "정서·행동형",
    "balanced": "균형형",
    "undetermined": "판별 불가",
}

# ── 축 B 대처 전략 (constants/strategy.ts와 미러) ────────────────
# 순서가 곧 동점 시 우선순위다. 프론트 STRATEGY_KEYS와 같은 순서를 지킬 것 —
# 어긋나면 같은 데이터에서 어드민과 앱의 '주 전략'이 달라진다.
STRATEGY_KEYS = ("accept", "reappraisal", "refocus")
STRATEGY_LABEL = {"accept": "수용", "reappraisal": "재평가", "refocus": "재초점"}

# ── 시나리오 4영역 (useScenarioStore.fetchThemes의 domains와 미러) ──
# 에피소드 id는 '{themeId}-ep{n}' 형식이다(예: 'job-prep-ep3').
SCENARIO_THEMES = (
    ("workplace", "직장"),
    ("job-prep", "취업준비"),
    ("relationship", "연인"),
    ("daily", "일상"),
)
EPISODE_ID_SEPARATOR = "-ep"

# 내보내기에서 **절대 마스킹을 뚫지 못하는 필드**는 없다(OFF면 전부 나간다).
# 이 목록은 "마스킹 ON일 때 열 자체가 생기지 않는" 필드다.
IDENTIFYING_FIELDS = ("uid", "email", "displayName", "photoURL", "character.nickname")

# uid 해시 길이. 같은 uid는 항상 같은 해시가 되어 개체 추적성이 유지되고,
# 해시에서 uid를 되돌릴 수는 없다. 10자면 수천 명 규모에서 충돌이 사실상 없다.
UID_HASH_LENGTH = 10

# ADHD 환산점수(0~100) 구간. 어드민 '검사 결과 분석' 히스토그램의 bins와 같은
# 경계를 쓴다 — ⚠️ 임상 절단점이 아니라 **표시용 구간**이다. 연구 보고서에서
# 진단 기준처럼 인용하면 안 된다.
ADHD_SCORE_BANDS = ((20, "0-20"), (40, "21-40"), (60, "41-60"), (80, "61-80"), (100, "81-100"))


def hash_uid(uid: str) -> str:
    """uid를 SHA-256 앞 N자로 대체한다. 같은 uid → 항상 같은 해시(개체 추적 가능)."""
    return hashlib.sha256(str(uid).encode("utf-8")).hexdigest()[:UID_HASH_LENGTH]


def format_timestamp(value, tz=KST) -> str:
    """Firestore Timestamp · ISO 문자열 · None을 'YYYY-MM-DD HH:MM:SS'(KST)로 만든다.

    앱이 저장하는 시각은 두 종류다: createdAt은 Firestore Timestamp(UTC),
    completedAt·updatedAt은 `new Date().toISOString()`이 만든 UTC ISO 문자열이다.
    둘 다 KST로 환산해 한 형식으로 맞춘다. 해석할 수 없는 값은 원문을 그대로
    돌려준다 — 내보내기에서 데이터를 조용히 버리는 것보다 낫다.
    """
    if value is None or value == "":
        return ""

    parsed = value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value

    if not isinstance(parsed, datetime):
        return str(value)

    # tz 정보가 없는 값은 UTC로 본다 (Firestore·JS 모두 UTC로 기록한다).
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(tz).strftime("%Y-%m-%d %H:%M:%S")


def adhd_score_band(score) -> str:
    """환산점수를 표시용 구간 라벨로. 임상 절단점이 아니다(위 상수 주석 참조)."""
    if not isinstance(score, (int, float)) or isinstance(score, bool):
        return ""
    for upper, label in ADHD_SCORE_BANDS:
        if score <= upper:
            return label
    # 문항 수가 6개가 아닌 CSV를 올리면 100을 넘을 수 있다(testScoring.ts 주석).
    return "범위 초과"


def theme_id_of(episode_id: str) -> str:
    """'job-prep-ep3' → 'job-prep'. 형식을 벗어난 키는 빈 문자열."""
    if EPISODE_ID_SEPARATOR not in episode_id:
        return ""
    return episode_id.rsplit(EPISODE_ID_SEPARATOR, 1)[0]


def summarize_scenarios(scenarios) -> dict:
    """users/{uid}.scenarios 맵을 연구용 요약값으로 접는다.

    집계 규칙은 프론트 strategyStats.computeStrategyStats와 같다:
      · 완주(cleared=True) 기록만 센다
      · 전략 키가 3종 밖이면 조용히 건너뛴다(레거시 방어)
      · 동점이면 STRATEGY_KEYS 순서상 앞선 키가 주 전략
      · 완주 0회면 dominant는 None, helpful_rate도 None (0%와 구분해야 한다)
    """
    cleared_by_theme = {theme_id: 0 for theme_id, _ in SCENARIO_THEMES}
    strategy_counts = {key: 0 for key in STRATEGY_KEYS}
    helpful_count = 0
    total_cleared = 0
    last_played = ""

    if isinstance(scenarios, dict):
        for episode_id, entry in scenarios.items():
            if not isinstance(entry, dict) or not entry.get("cleared"):
                continue
            total_cleared += 1

            theme_id = theme_id_of(str(episode_id))
            if theme_id in cleared_by_theme:
                cleared_by_theme[theme_id] += 1

            angel = entry.get("selectedAngel")
            if angel in strategy_counts:
                strategy_counts[angel] += 1

            if entry.get("wasHelpful"):
                helpful_count += 1

            # updatedAt은 ISO 문자열이라 사전순 비교가 곧 시간순 비교다
            # (findLatestPlayedThemeId와 같은 근거).
            updated_at = entry.get("updatedAt") or ""
            if isinstance(updated_at, str) and updated_at > last_played:
                last_played = updated_at

    dominant = None
    if total_cleared > 0:
        dominant = max(STRATEGY_KEYS, key=lambda key: (strategy_counts[key], -STRATEGY_KEYS.index(key)))

    return {
        "total_cleared": total_cleared,
        "cleared_by_theme": cleared_by_theme,
        "strategy_counts": strategy_counts,
        "dominant": dominant,
        "helpful_count": helpful_count,
        "helpful_rate": None if total_cleared == 0 else round(helpful_count / total_cleared * 100),
        "last_played_at": last_played,
    }


def flatten_user_row(uid: str, data, mask: bool = True) -> dict:
    """users/{uid} 문서 하나를 CSV 한 행(dict)으로 편다.

    mask=True(기본)면 email·displayName·photoURL·character.nickname 열이 **아예
    만들어지지 않고**, uid는 해시로만 나간다. mask=False는 연구 목적 외 반출이
    금지된 원문 내보내기다 — 화면에서 경고를 받은 뒤에만 호출된다.
    """
    data = data if isinstance(data, dict) else {}
    character = data.get("character") if isinstance(data.get("character"), dict) else {}
    adhd = data.get("adhdResult") if isinstance(data.get("adhdResult"), dict) else {}
    stress = data.get("stressResult") if isinstance(data.get("stressResult"), dict) else {}
    counts = stress.get("counts") if isinstance(stress.get("counts"), dict) else {}
    scenario = summarize_scenarios(data.get("scenarios"))

    row = {"uid_hash": hash_uid(uid)}

    if not mask:
        row["uid"] = str(uid)
        row["email"] = data.get("email", "") or ""
        row["display_name"] = data.get("displayName", "") or ""
        row["photo_url"] = data.get("photoURL", "") or ""
        row["character_nickname"] = character.get("nickname", "") or ""

    row["created_at"] = format_timestamp(data.get("createdAt"))
    # 성별은 마스킹 대상이 아니다 — 개인을 지목하지 못하는 인구통계 변수이고,
    # 효과 검증에서 하위집단 분석에 쓰인다.
    row["character_gender"] = character.get("gender", "") or ""

    row["adhd_completed_at"] = format_timestamp(adhd.get("completedAt"))
    row["adhd_raw_score"] = adhd.get("rawScore", "")
    row["adhd_score"] = adhd.get("score", "")
    row["adhd_score_band"] = adhd_score_band(adhd.get("score"))

    row["stress_completed_at"] = format_timestamp(stress.get("completedAt"))
    row["stress_score"] = stress.get("score", "")
    row["stress_cognitive"] = counts.get("cognitive", "")
    row["stress_emotional"] = counts.get("emotional", "")
    row["stress_behavioral"] = counts.get("behavioral", "")
    result_type = stress.get("resultType", "") or ""
    row["stress_result_type"] = result_type
    row["stress_result_type_label"] = STRESS_RESULT_TYPE_LABEL.get(result_type, "")

    row["scenario_cleared_total"] = scenario["total_cleared"]
    for theme_id, _ in SCENARIO_THEMES:
        row[f"scenario_cleared_{theme_id.replace('-', '_')}"] = scenario["cleared_by_theme"][theme_id]

    for key in STRATEGY_KEYS:
        row[f"strategy_{key}"] = scenario["strategy_counts"][key]
    row["strategy_dominant"] = scenario["dominant"] or ""
    row["strategy_dominant_label"] = STRATEGY_LABEL.get(scenario["dominant"], "")

    row["helpful_count"] = scenario["helpful_count"]
    # 완주 0회는 빈 칸이다 — 0%로 적으면 "한 번도 도움이 안 됐다"로 읽힌다.
    row["helpful_rate"] = "" if scenario["helpful_rate"] is None else scenario["helpful_rate"]
    row["scenario_last_played_at"] = format_timestamp(scenario["last_played_at"])

    return row


def export_columns(mask: bool = True) -> list:
    """내보내기 열 순서의 단일 출처. 유저가 0명이어도 헤더는 나가야 한다."""
    return list(flatten_user_row("sample-uid", {}, mask=mask).keys())


def build_export_dataframe(users, mask: bool = True) -> pd.DataFrame:
    """(uid, 문서 dict) 목록을 내보내기용 DataFrame으로.

    users가 비어도 헤더만 있는 빈 DataFrame을 돌려준다 — 연구자가 열 구성을
    미리 확인할 수 있고, 빈 파일을 받아도 원인을 알 수 있다.
    """
    rows = [flatten_user_row(uid, data, mask=mask) for uid, data in users]
    return pd.DataFrame(rows, columns=export_columns(mask=mask))


def to_csv_bytes(df: pd.DataFrame) -> bytes:
    """연구자가 엑셀에서 바로 열 수 있도록 **UTF-8 BOM**을 붙인다.

    BOM이 없으면 한국어 Windows 엑셀이 CSV를 cp949로 읽어 한글이 깨진다.
    ⚠️ DB CSV 내려받기(콘텐츠 원문)는 정반대로 BOM을 붙이면 안 된다 —
    프론트 파서가 헤더 이름으로 열을 찾기 때문에 첫 열 이름이 '﻿NO'가 되면
    조용히 매칭에 실패한다.
    """
    return df.to_csv(index=False).encode("utf-8-sig")


def export_filename(mask: bool = True, now=None) -> str:
    """내보내기 파일명. 시각은 KST 기준."""
    stamp = (now or datetime.now(KST)).strftime("%Y%m%d-%H%M")
    suffix = "" if mask else "-unmasked"
    return f"syu-react-research{suffix}-{stamp}.csv"


# ── CSV 버전 보관 / 롤백 ─────────────────────────────────────────

def now_iso(tz=timezone.utc) -> str:
    return datetime.now(tz).isoformat()


def build_upload_payload(new_csv: str, current_csv, current_updated_at=None) -> dict:
    """업로드·저장 시 Firestore에 merge할 payload를 만든다.

    기존 csvText를 previousCsvText로 밀어 넣어 되돌릴 지점을 남긴다.
    **내용이 같으면 보관을 갱신하지 않는다** — 같은 파일을 실수로 다시 올렸을 때
    previousCsvText까지 같은 내용으로 덮이면 되돌릴 곳이 사라지기 때문이다.
    """
    payload = {CSV_TEXT_FIELD: new_csv}
    if current_csv and current_csv != new_csv:
        payload[PREVIOUS_CSV_TEXT_FIELD] = current_csv
        payload[PREVIOUS_UPDATED_AT_FIELD] = current_updated_at or now_iso()
    return payload


def build_rollback_payload(current_csv: str, previous_csv: str, current_updated_at=None) -> dict:
    """되돌리기 = 현재↔이전 **스왑**. 두 번 누르면 원상복구된다."""
    return {
        CSV_TEXT_FIELD: previous_csv,
        PREVIOUS_CSV_TEXT_FIELD: current_csv,
        PREVIOUS_UPDATED_AT_FIELD: current_updated_at or now_iso(),
    }


def can_rollback(doc_data) -> bool:
    """되돌릴 이전 버전이 실제로 보관돼 있는가."""
    if not isinstance(doc_data, dict):
        return False
    return bool(doc_data.get(PREVIOUS_CSV_TEXT_FIELD))


def summarize_csv_text(text) -> dict:
    """행 수·글자 수·바이트 수. 되돌리기 전에 두 버전을 눈으로 대조하는 용도."""
    text = text or ""
    lines = len(text.splitlines())
    return {
        # 헤더 1줄을 뺀 것이 사람이 세는 '행 수'다.
        "rows": max(lines - 1, 0),
        "lines": lines,
        "chars": len(text),
        "bytes": len(text.encode("utf-8")),
    }


def compare_versions(current_csv, previous_csv, previous_updated_at=None) -> pd.DataFrame:
    """현재/이전 두 버전의 크기 비교표. st.dataframe에 그대로 넘긴다.

    혼합 타입 DataFrame이 Arrow 직렬화에서 프로세스를 죽인 전례가 있어
    (streamlit_app.py:236 주석) 전 칸을 문자열로 만든다.
    """
    current = summarize_csv_text(current_csv)
    previous = summarize_csv_text(previous_csv)
    return pd.DataFrame(
        [
            {
                "구분": "현재 버전",
                "행 수": f"{current['rows']:,}",
                "글자 수": f"{current['chars']:,}",
                "크기(바이트)": f"{current['bytes']:,}",
                "저장 시각": "",
            },
            {
                "구분": "이전 버전 (되돌릴 대상)",
                "행 수": f"{previous['rows']:,}",
                "글자 수": f"{previous['chars']:,}",
                "크기(바이트)": f"{previous['bytes']:,}",
                "저장 시각": format_timestamp(previous_updated_at),
            },
        ]
    )
