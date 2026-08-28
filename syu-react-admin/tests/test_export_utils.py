# tests/test_export_utils.py
# 연구용 내보내기(마스킹·플랫화)와 CSV 버전 보관(롤백 스왑)의 순수 함수 테스트.
#
# 검증의 중심은 두 가지다:
#   1) 마스킹 ON에서 식별 정보가 **한 글자도** 파일에 남지 않는가
#   2) 되돌리기를 두 번 누르면 원상복구되는가(스왑의 대칭성)
from datetime import datetime, timezone

import pandas as pd

from export_utils import (
    CSV_TEXT_FIELD,
    PREVIOUS_CSV_TEXT_FIELD,
    PREVIOUS_UPDATED_AT_FIELD,
    adhd_score_band,
    build_export_dataframe,
    build_rollback_payload,
    build_upload_payload,
    can_rollback,
    compare_versions,
    export_columns,
    export_filename,
    flatten_user_row,
    format_timestamp,
    hash_uid,
    summarize_csv_text,
    summarize_scenarios,
    theme_id_of,
    to_csv_bytes,
)


def make_user_doc(**overrides):
    """실제 users/{uid} 문서 모양의 표본. 필드명은 firestoreKeys.ts와 미러."""
    doc = {
        "email": "tester@example.com",
        "displayName": "홍길동",
        "photoURL": "https://example.com/photo.png",
        "createdAt": datetime(2026, 8, 1, 3, 0, 0, tzinfo=timezone.utc),
        "character": {"nickname": "길동이", "gender": "male"},
        "adhdResult": {
            "testType": "adhd",
            "answers": {1: 4, 2: 3},
            "rawScore": 18,
            "score": 75,
            "completedAt": "2026-08-02T01:30:00.000Z",
        },
        "stressResult": {
            "testType": "stress",
            "score": 7,
            "counts": {"cognitive": 4, "emotional": 2, "behavioral": 1},
            "resultType": "cognitive",
            "completedAt": "2026-08-02T02:00:00.000Z",
        },
        "scenarios": {
            "workplace-ep1": cleared("accept", True, "2026-08-03T10:00:00.000Z"),
            "workplace-ep2": cleared("accept", False, "2026-08-04T10:00:00.000Z"),
            "job-prep-ep1": cleared("reappraisal", True, "2026-08-05T10:00:00.000Z"),
            "daily-ep7": cleared("refocus", True, "2026-08-06T10:00:00.000Z"),
        },
    }
    doc.update(overrides)
    return doc


def cleared(angel, was_helpful, updated_at, is_cleared=True):
    return {
        "cleared": is_cleared,
        "selectedAngel": angel,
        "wasHelpful": was_helpful,
        "selectedReason": "실질적인 도움이 됨",
        "updatedAt": updated_at,
    }


class TestHashUid:
    def test_같은_uid는_항상_같은_해시다(self):
        assert hash_uid("abc123") == hash_uid("abc123")

    def test_다른_uid는_다른_해시다(self):
        assert hash_uid("abc123") != hash_uid("abc124")

    def test_길이는_10자다(self):
        assert len(hash_uid("abc123")) == 10

    def test_원문이_해시에_남지_않는다(self):
        assert "abc123" not in hash_uid("abc123")


class TestFormatTimestamp:
    def test_UTC_ISO_문자열을_KST로_환산한다(self):
        # 01:30 UTC = 10:30 KST
        assert format_timestamp("2026-08-02T01:30:00.000Z") == "2026-08-02 10:30:00"

    def test_datetime도_KST로_환산한다(self):
        value = datetime(2026, 8, 1, 3, 0, 0, tzinfo=timezone.utc)
        assert format_timestamp(value) == "2026-08-01 12:00:00"

    def test_tz가_없는_datetime은_UTC로_본다(self):
        assert format_timestamp(datetime(2026, 8, 1, 3, 0, 0)) == "2026-08-01 12:00:00"

    def test_없는_값은_빈_문자열이다(self):
        assert format_timestamp(None) == ""
        assert format_timestamp("") == ""

    def test_해석할_수_없는_값은_원문을_돌려준다(self):
        assert format_timestamp("언젠가") == "언젠가"


class TestAdhdScoreBand:
    def test_구간_경계(self):
        assert adhd_score_band(0) == "0-20"
        assert adhd_score_band(20) == "0-20"
        assert adhd_score_band(21) == "21-40"
        assert adhd_score_band(100) == "81-100"

    def test_100을_넘으면_범위_초과다(self):
        # 문항 수가 6개가 아닌 CSV를 올리면 환산점수가 100을 넘을 수 있다.
        assert adhd_score_band(120) == "범위 초과"

    def test_점수가_없으면_빈_문자열이다(self):
        assert adhd_score_band(None) == ""
        assert adhd_score_band("") == ""


class TestThemeIdOf:
    def test_대시가_들어간_영역도_바르게_자른다(self):
        assert theme_id_of("job-prep-ep3") == "job-prep"

    def test_두자리_회차(self):
        assert theme_id_of("daily-ep10") == "daily"

    def test_형식을_벗어나면_빈_문자열이다(self):
        assert theme_id_of("garbage") == ""


class TestSummarizeScenarios:
    def test_완주하지_않은_기록은_세지_않는다(self):
        summary = summarize_scenarios({
            "daily-ep1": cleared("accept", True, "2026-08-01T00:00:00Z", is_cleared=False),
        })
        assert summary["total_cleared"] == 0
        assert summary["dominant"] is None
        assert summary["helpful_rate"] is None

    def test_영역별_완주_수를_센다(self):
        summary = summarize_scenarios(make_user_doc()["scenarios"])
        assert summary["total_cleared"] == 4
        assert summary["cleared_by_theme"]["workplace"] == 2
        assert summary["cleared_by_theme"]["job-prep"] == 1
        assert summary["cleared_by_theme"]["daily"] == 1
        assert summary["cleared_by_theme"]["relationship"] == 0

    def test_전략별_카운트와_주_전략(self):
        summary = summarize_scenarios(make_user_doc()["scenarios"])
        assert summary["strategy_counts"] == {"accept": 2, "reappraisal": 1, "refocus": 1}
        assert summary["dominant"] == "accept"

    def test_동점이면_앞선_키가_이긴다(self):
        # 프론트 computeStrategyStats와 같은 규칙 — STRATEGY_KEYS 순서상 앞선 키.
        summary = summarize_scenarios({
            "daily-ep1": cleared("refocus", True, "2026-08-01T00:00:00Z"),
            "daily-ep2": cleared("reappraisal", True, "2026-08-02T00:00:00Z"),
        })
        assert summary["dominant"] == "reappraisal"

    def test_모르는_전략_키는_건너뛴다(self):
        summary = summarize_scenarios({
            "daily-ep1": cleared("unknown-strategy", True, "2026-08-01T00:00:00Z"),
        })
        assert summary["total_cleared"] == 1
        assert summary["strategy_counts"] == {"accept": 0, "reappraisal": 0, "refocus": 0}

    def test_도움됨_비율(self):
        summary = summarize_scenarios(make_user_doc()["scenarios"])
        assert summary["helpful_count"] == 3
        assert summary["helpful_rate"] == 75

    def test_최근_플레이_시각은_최댓값이다(self):
        summary = summarize_scenarios(make_user_doc()["scenarios"])
        assert summary["last_played_at"] == "2026-08-06T10:00:00.000Z"

    def test_scenarios가_없어도_깨지지_않는다(self):
        assert summarize_scenarios(None)["total_cleared"] == 0


class TestFlattenUserRow:
    def test_마스킹_ON이면_식별_열이_아예_없다(self):
        row = flatten_user_row("uid-1", make_user_doc(), mask=True)
        for column in ("uid", "email", "display_name", "photo_url", "character_nickname"):
            assert column not in row

    def test_마스킹_ON에서도_uid_해시로_개체를_추적할_수_있다(self):
        row_a = flatten_user_row("uid-1", make_user_doc(), mask=True)
        row_b = flatten_user_row("uid-1", make_user_doc(), mask=True)
        assert row_a["uid_hash"] == row_b["uid_hash"] == hash_uid("uid-1")

    def test_마스킹_OFF면_식별_열이_생긴다(self):
        row = flatten_user_row("uid-1", make_user_doc(), mask=False)
        assert row["uid"] == "uid-1"
        assert row["email"] == "tester@example.com"
        assert row["display_name"] == "홍길동"
        assert row["character_nickname"] == "길동이"

    def test_성별은_마스킹해도_남는다(self):
        # 개인을 지목하지 못하는 인구통계 변수이고 하위집단 분석에 쓴다.
        assert flatten_user_row("uid-1", make_user_doc(), mask=True)["character_gender"] == "male"

    def test_검사_결과가_플랫하게_펴진다(self):
        row = flatten_user_row("uid-1", make_user_doc(), mask=True)
        assert row["adhd_raw_score"] == 18
        assert row["adhd_score"] == 75
        assert row["adhd_score_band"] == "61-80"
        assert row["stress_score"] == 7
        assert row["stress_cognitive"] == 4
        assert row["stress_result_type"] == "cognitive"
        assert row["stress_result_type_label"] == "인지형"

    def test_시각은_KST로_적힌다(self):
        row = flatten_user_row("uid-1", make_user_doc(), mask=True)
        assert row["created_at"] == "2026-08-01 12:00:00"
        assert row["adhd_completed_at"] == "2026-08-02 10:30:00"

    def test_완주가_없으면_도움됨_비율은_빈_칸이다(self):
        # 0%로 적으면 "한 번도 도움이 안 됐다"로 읽힌다 — 빈 칸이어야 한다.
        row = flatten_user_row("uid-1", {}, mask=True)
        assert row["helpful_rate"] == ""
        assert row["strategy_dominant"] == ""

    def test_검사도_캐릭터도_없는_문서에서_깨지지_않는다(self):
        row = flatten_user_row("uid-1", {}, mask=True)
        assert row["uid_hash"] == hash_uid("uid-1")
        assert row["adhd_score"] == ""
        assert row["scenario_cleared_total"] == 0

    def test_잘못된_타입의_필드도_넘긴다(self):
        # 콘솔에서 손으로 고친 문서가 들어와도 내보내기가 통째로 실패하면 안 된다.
        row = flatten_user_row("uid-1", {"adhdResult": "깨진값", "scenarios": []}, mask=True)
        assert row["adhd_score"] == ""
        assert row["scenario_cleared_total"] == 0


class TestBuildExportDataframe:
    def test_유저가_없어도_헤더는_나온다(self):
        df = build_export_dataframe([], mask=True)
        assert len(df) == 0
        assert list(df.columns) == export_columns(mask=True)

    def test_마스킹_ON_CSV에_식별_정보가_한_글자도_없다(self):
        df = build_export_dataframe([("uid-1", make_user_doc())], mask=True)
        text = to_csv_bytes(df).decode("utf-8-sig")
        for secret in ("tester@example.com", "홍길동", "길동이", "uid-1", "example.com/photo.png"):
            assert secret not in text

    def test_마스킹_OFF_CSV에는_식별_정보가_들어간다(self):
        df = build_export_dataframe([("uid-1", make_user_doc())], mask=False)
        text = to_csv_bytes(df).decode("utf-8-sig")
        assert "tester@example.com" in text
        assert "uid-1" in text

    def test_유저_한_명당_한_행이다(self):
        users = [("uid-1", make_user_doc()), ("uid-2", make_user_doc()), ("uid-3", {})]
        assert len(build_export_dataframe(users, mask=True)) == 3

    def test_마스킹_OFF는_열이_더_많다(self):
        assert len(export_columns(mask=False)) > len(export_columns(mask=True))


class TestCsvBytes:
    def test_엑셀을_위해_BOM을_붙인다(self):
        df = build_export_dataframe([("uid-1", make_user_doc())], mask=True)
        assert to_csv_bytes(df).startswith(b"\xef\xbb\xbf")

    def test_한글이_깨지지_않는다(self):
        df = build_export_dataframe([("uid-1", make_user_doc())], mask=True)
        assert "인지형" in to_csv_bytes(df).decode("utf-8-sig")


class TestExportFilename:
    def test_마스킹_여부가_파일명에_드러난다(self):
        now = datetime(2026, 8, 13, 18, 30)
        assert export_filename(mask=True, now=now) == "syu-react-research-20260813-1830.csv"
        assert export_filename(mask=False, now=now) == "syu-react-research-unmasked-20260813-1830.csv"


class TestUploadPayload:
    def test_기존_내용을_이전_버전으로_보관한다(self):
        payload = build_upload_payload("새 내용", "옛 내용", "2026-08-01T00:00:00+00:00")
        assert payload[CSV_TEXT_FIELD] == "새 내용"
        assert payload[PREVIOUS_CSV_TEXT_FIELD] == "옛 내용"
        assert payload[PREVIOUS_UPDATED_AT_FIELD] == "2026-08-01T00:00:00+00:00"

    def test_기존_문서가_없으면_보관하지_않는다(self):
        payload = build_upload_payload("새 내용", "")
        assert payload == {CSV_TEXT_FIELD: "새 내용"}

    def test_같은_내용을_다시_올리면_보관을_갱신하지_않는다(self):
        # 갱신해 버리면 되돌릴 지점이 같은 내용으로 덮여 롤백이 무의미해진다.
        payload = build_upload_payload("같은 내용", "같은 내용")
        assert PREVIOUS_CSV_TEXT_FIELD not in payload

    def test_갱신_시각을_모르면_지금_시각을_적는다(self):
        payload = build_upload_payload("새 내용", "옛 내용")
        assert payload[PREVIOUS_UPDATED_AT_FIELD]


class TestRollback:
    def test_보관본이_없으면_되돌릴_수_없다(self):
        assert can_rollback(None) is False
        assert can_rollback({}) is False
        assert can_rollback({PREVIOUS_CSV_TEXT_FIELD: ""}) is False
        assert can_rollback({PREVIOUS_CSV_TEXT_FIELD: "A"}) is True

    def test_되돌리기는_현재와_이전을_맞바꾼다(self):
        payload = build_rollback_payload("B", "A")
        assert payload[CSV_TEXT_FIELD] == "A"
        assert payload[PREVIOUS_CSV_TEXT_FIELD] == "B"

    def test_두_번_누르면_원상복구된다(self):
        doc = {CSV_TEXT_FIELD: "B", PREVIOUS_CSV_TEXT_FIELD: "A"}

        doc = {**doc, **build_rollback_payload(doc[CSV_TEXT_FIELD], doc[PREVIOUS_CSV_TEXT_FIELD])}
        assert doc[CSV_TEXT_FIELD] == "A"

        doc = {**doc, **build_rollback_payload(doc[CSV_TEXT_FIELD], doc[PREVIOUS_CSV_TEXT_FIELD])}
        assert doc[CSV_TEXT_FIELD] == "B"
        assert doc[PREVIOUS_CSV_TEXT_FIELD] == "A"

    def test_업로드한_직후_되돌리면_업로드_전_내용이_된다(self):
        doc = {CSV_TEXT_FIELD: "원본"}
        doc = {**doc, **build_upload_payload("새 원고", doc[CSV_TEXT_FIELD])}
        assert doc[CSV_TEXT_FIELD] == "새 원고"

        doc = {**doc, **build_rollback_payload(doc[CSV_TEXT_FIELD], doc[PREVIOUS_CSV_TEXT_FIELD])}
        assert doc[CSV_TEXT_FIELD] == "원본"


class TestVersionComparison:
    def test_헤더를_뺀_행_수를_센다(self):
        summary = summarize_csv_text("id,question\n1,가\n2,나\n")
        assert summary["rows"] == 2
        assert summary["lines"] == 3

    def test_빈_텍스트도_0으로_처리한다(self):
        assert summarize_csv_text("")["rows"] == 0
        assert summarize_csv_text(None)["rows"] == 0

    def test_한글은_바이트가_글자보다_많다(self):
        summary = summarize_csv_text("가나다")
        assert summary["chars"] == 3
        assert summary["bytes"] == 9

    def test_비교표는_두_행이고_전부_문자열이다(self):
        df = compare_versions("a,b\n1,2\n", "a,b\n1,2\n3,4\n", "2026-08-01T00:00:00Z")
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 2
        assert all(isinstance(v, str) for v in df.to_numpy().ravel())
        assert df.iloc[1]["저장 시각"] == "2026-08-01 09:00:00"
