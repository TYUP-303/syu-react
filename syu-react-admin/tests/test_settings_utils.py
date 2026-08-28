# tests/test_settings_utils.py
#
# settings_utils.py의 **판단 규칙**을 고정한다.
#
# 이 화면이 다루는 것은 법무 문서다. 잘못 저장하면 사용자에게 곧바로 게시되고,
# 앱은 형식 오류를 화면에 보여 주지 않고 조용히 코드 기본값으로 폴백하므로
# 운영팀이 알아채기 어렵다. 그래서 여기서 고정하는 것은 화면 모양이 아니라
# 세 가지다:
#   - 형식 검사가 잘못된 값을 막는가 (막지 못하면 앱이 통째로 폴백한다)
#   - 되돌리기가 **완전히** 되돌리는가 (일부만 되돌아가면 알아채지 못한다)
#   - 미리보기가 앱 화면과 같은가 (다르면 운영팀이 확인한 것과 다른 문서가 나간다)
#
# export_utils 테스트와 같은 계약 — Streamlit 없이 순수 함수만 직접 호출한다.

import pandas as pd
import pytest

from export_utils import PREVIOUS_UPDATED_AT_FIELD
from settings_utils import (
    CONTACT_EMAIL_FIELD,
    HISTORY_LIMIT,
    INQUIRY_EMAIL_FIELD,
    MARKETING_CONSENT_ENABLED_DEFAULT,
    MARKETING_CONSENT_ENABLED_FIELD,
    MARKETING_SECTIONS_FIELD,
    NOTICE_ACTIVE_FIELD,
    NOTICE_MESSAGE_FIELD,
    OFFICER_AFFILIATION,
    OFFICER_NAME_FIELD,
    PREVIOUS_LEGAL_FIELD,
    PRIVACY_SECTIONS_FIELD,
    SAVED_AT_FIELD,
    SECTION_BODY_COLUMN,
    SECTION_HEADING_COLUMN,
    SNAPSHOT_CAPTURED_AT_KEY,
    SNAPSHOT_COMMIT_KEY,
    SNAPSHOT_DIR_NAME,
    SNAPSHOT_META_NAME,
    STATUS_DIFFERENT,
    STATUS_SAME,
    STATUS_UNSET,
    TERMS_SECTIONS_FIELD,
    UPDATED_AT_FIELD,
    VERSION_FIELD,
    build_history_payload,
    build_history_rows,
    build_legal_payload,
    build_legal_rollback_payload,
    build_notice_payload,
    build_officer_section_body,
    can_rollback_legal,
    compare_legal_drift,
    compare_legal_versions,
    history_doc_id,
    history_entry_labels,
    history_section_titles,
    is_officer_section,
    load_legal_source,
    marketing_status_label,
    normalize_sections,
    notice_status_label,
    parse_legal_defaults,
    parse_snapshot_meta,
    preview_privacy_sections,
    records_to_sections,
    resolve_marketing_enabled,
    resolve_notice,
    sections_to_records,
    sections_to_text,
    snapshot_legal,
    snapshot_notice,
    validate_sections,
)

SECTIONS = [
    {"heading": "제 1 조 (목적)", "body": "본문 1"},
    {"heading": "제 2 조 (정의)", "body": "본문 2"},
]


# ── 조항 배열 형식 ────────────────────────────────────────────────

class TestNormalizeSections:
    def test_올바른_배열은_그대로_통과한다(self):
        assert normalize_sections(SECTIONS) == SECTIONS

    def test_빈_배열과_배열이_아닌_값은_None이다(self):
        # 조항 없는 약관이 게시되는 것을 막는다.
        assert normalize_sections([]) is None
        assert normalize_sections(None) is None
        assert normalize_sections("제 1 조") is None
        assert normalize_sections({"heading": "제 1 조", "body": "본문"}) is None

    def test_한_조항이라도_깨지면_배열_전체를_버린다(self):
        # 절반만 적용하면 조항이 중간에 사라진 법무 문서가 게시된다.
        assert normalize_sections([{"heading": "제 1 조", "body": "본문"}, {"heading": "제 2 조"}]) is None
        assert normalize_sections([{"heading": "", "body": "본문"}]) is None
        assert normalize_sections([{"heading": "제 1 조", "body": 3}]) is None

    def test_본문이_빈_조항은_허용한다(self):
        assert normalize_sections([{"heading": "제 1 조", "body": ""}]) is not None

    def test_모르는_키는_떨어낸다(self):
        result = normalize_sections([{"heading": "제 1 조", "body": "본문", "메모": "내부용"}])
        assert result == [{"heading": "제 1 조", "body": "본문"}]


class TestSectionsRoundTrip:
    def test_표로_바꿨다_되돌려도_같다(self):
        assert records_to_sections(sections_to_records(SECTIONS)) == SECTIONS

    def test_형식이_깨진_값은_빈_표가_된다(self):
        assert sections_to_records(None) == []
        assert sections_to_records([{"heading": "제 1 조"}]) == []

    def test_제목이_빈_행은_버린다(self):
        # data_editor의 빈 행을 그대로 저장하면 앱의 형식 검사에 걸려
        # 문서 전체가 폴백한다 — 고친 내용이 통째로 안 보이게 된다.
        records = [
            {SECTION_HEADING_COLUMN: "제 1 조", SECTION_BODY_COLUMN: "본문"},
            {SECTION_HEADING_COLUMN: "   ", SECTION_BODY_COLUMN: ""},
            {SECTION_HEADING_COLUMN: "", SECTION_BODY_COLUMN: "제목 없는 본문"},
        ]
        assert records_to_sections(records) == [{"heading": "제 1 조", "body": "본문"}]

    def test_제목_앞뒤_공백은_다듬는다(self):
        records = [{SECTION_HEADING_COLUMN: "  제 1 조  ", SECTION_BODY_COLUMN: "본문"}]
        assert records_to_sections(records) == [{"heading": "제 1 조", "body": "본문"}]

    def test_NaN이_섞여도_터지지_않는다(self):
        # pandas data_editor는 빈 칸을 NaN으로 돌려준다.
        records = pd.DataFrame(
            [{SECTION_HEADING_COLUMN: "제 1 조", SECTION_BODY_COLUMN: None}]
        ).to_dict("records")
        assert records_to_sections(records) == [{"heading": "제 1 조", "body": ""}]


class TestValidateSections:
    def test_정상_조항은_오류가_없다(self):
        errors, warnings = validate_sections(SECTIONS)
        assert errors == []
        assert warnings == []

    def test_조항이_하나도_없으면_저장을_막는다(self):
        errors, _ = validate_sections([])
        assert len(errors) == 1

    def test_제목이_중복되면_저장을_막는다(self):
        # 앱은 heading을 목록 key로 쓴다 — 중복이면 조항 하나가 화면에서 빠진다.
        errors, _ = validate_sections(
            [{"heading": "제 1 조", "body": "본문"}, {"heading": "제 1 조", "body": "다른 본문"}]
        )
        assert any("중복" in msg for msg in errors)

    def test_본문이_비면_경고만_하고_막지는_않는다(self):
        errors, warnings = validate_sections([{"heading": "제 1 조", "body": "  "}])
        assert errors == []
        assert len(warnings) == 1


# ── 보호책임자 조항 ───────────────────────────────────────────────

class TestOfficerSection:
    def test_제목으로_찾는다(self):
        # 조항 번호가 아니라 낱말로 찾아야 번호가 밀려도 계속 잡힌다.
        assert is_officer_section("10. 개인정보 보호책임자")
        assert is_officer_section("9. 개인정보 보호책임자")
        assert not is_officer_section("1. 개인정보의 수집 항목")
        assert not is_officer_section(None)

    def test_본문에_성명과_연락처가_들어간다(self):
        body = build_officer_section_body("홍길동", "privacy@example.com")
        assert "- 성명: 홍길동" in body
        assert "- 연락처: privacy@example.com" in body
        assert OFFICER_AFFILIATION in body

    def test_미리보기가_보호책임자_조항을_다시_만든다(self):
        # 어드민 미리보기와 앱 화면이 달라지면 운영팀이 확인한 것과 다른
        # 문서가 게시된다.
        sections = [
            {"heading": "1. 수집 항목", "body": "그대로"},
            {"heading": "10. 개인정보 보호책임자", "body": "- 성명: 옛담당자"},
        ]
        result = preview_privacy_sections(sections, "홍길동", "privacy@example.com")

        assert result[0]["body"] == "그대로"
        assert "홍길동" in result[1]["body"]
        assert "옛담당자" not in result[1]["body"]

    def test_미리보기는_원본을_훼손하지_않는다(self):
        sections = [{"heading": "10. 개인정보 보호책임자", "body": "원본"}]
        preview_privacy_sections(sections, "홍길동", "privacy@example.com")
        assert sections[0]["body"] == "원본"

    def test_전문_텍스트는_제목과_본문을_이어_붙인다(self):
        assert sections_to_text(SECTIONS) == "제 1 조 (목적)\n본문 1\n\n제 2 조 (정의)\n본문 2"
        assert sections_to_text(None) == ""


# ── 코드 기본값 파싱 ──────────────────────────────────────────────

LEGAL_TS_SAMPLE = """
export const CONTACT_EMAIL = 'lnkv.dev@gmail.com';
export const INQUIRY_EMAIL = 'lnkv.dev@gmail.com';
export const LEGAL_VERSION = '2026-08-16';
export const OFFICER_NAME = '김영원';

export const TERMS: LegalDocument = {
  title: '이용약관',
  sections: [
    { heading: '제 1 조 (목적)', body: '본문' },
    { heading: '제 2 조 (용어의 정의)', body: '본문' },
  ],
};

export const PRIVACY: LegalDocument = {
  title: '개인정보 처리방침',
  sections: [
    { heading: '1. 개인정보의 수집 항목 및 방법', body: '본문' },
    { heading: '10. 개인정보 보호책임자', body: '본문' },
    { heading: '11. 처리방침의 변경', body: '본문' },
  ],
};

export const MARKETING_CONSENT_ENABLED_DEFAULT = true;

export const MARKETING: LegalDocument = {
  title: '마케팅 정보 수신 동의',
  sections: [
    { heading: '제 1 조 (동의의 목적)', body: '본문' },
    { heading: '제 9 조 (문의처 및 개인정보 보호책임자)', body: '본문' },
  ],
};
"""


class TestParseLegalDefaults:
    def test_운영_정보_네_가지를_뽑는다(self):
        parsed = parse_legal_defaults(LEGAL_TS_SAMPLE)
        assert parsed[OFFICER_NAME_FIELD] == "김영원"
        assert parsed[CONTACT_EMAIL_FIELD] == "lnkv.dev@gmail.com"
        assert parsed[INQUIRY_EMAIL_FIELD] == "lnkv.dev@gmail.com"
        assert parsed[VERSION_FIELD] == "2026-08-16"

    def test_약관과_처리방침의_조항_제목을_갈라_뽑는다(self):
        parsed = parse_legal_defaults(LEGAL_TS_SAMPLE)
        assert parsed["termsHeadings"] == ["제 1 조 (목적)", "제 2 조 (용어의 정의)"]
        assert len(parsed["privacyHeadings"]) == 3

    def test_마케팅_조항이_처리방침에_섞이지_않는다(self):
        # 문서가 셋이 되면서 "앞/뒤" 두 조각으로는 부족해졌다 — 처리방침 구간을
        # 파일 끝까지로 잡으면 마케팅 조항이 처리방침 것으로 세어진다.
        parsed = parse_legal_defaults(LEGAL_TS_SAMPLE)
        assert len(parsed["marketingHeadings"]) == 2
        assert "제 1 조 (동의의 목적)" not in parsed["privacyHeadings"]
        assert "11. 처리방침의 변경" not in parsed["marketingHeadings"]

    def test_표시_스위치의_코드_기본값을_불리언으로_뽑는다(self):
        # 문자열 상수와 달리 따옴표가 없어 별도 정규식이 필요하다.
        parsed = parse_legal_defaults(LEGAL_TS_SAMPLE)
        assert parsed[MARKETING_CONSENT_ENABLED_FIELD] is True
        assert (
            parse_legal_defaults("export const MARKETING_CONSENT_ENABLED_DEFAULT = false;")[
                MARKETING_CONSENT_ENABLED_FIELD
            ]
            is False
        )

    def test_같은_접두사_상수를_문서_경계로_착각하지_않는다(self):
        # MARKETING_CONSENT_ENABLED_DEFAULT가 MARKETING 문서보다 앞에 있다 —
        # 'export const MARKETING'만 찾으면 경계가 그쪽에 잡혀 조항이 0개가 된다.
        parsed = parse_legal_defaults(LEGAL_TS_SAMPLE)
        assert parsed["marketingHeadings"]

    def test_빈_입력에도_터지지_않는다(self):
        parsed = parse_legal_defaults("")
        assert parsed[OFFICER_NAME_FIELD] is None
        assert parsed["termsHeadings"] == []
        assert parsed["marketingHeadings"] == []
        assert parsed[MARKETING_CONSENT_ENABLED_FIELD] is None

    def test_실제_legal_ts를_읽어_낸다(self):
        # 정규식이 실제 파일 모양과 어긋나면 드리프트 표가 조용히 "(찾지 못함)"이
        # 된다 — 저장소가 있는 환경에서는 진짜 파일로 확인한다.
        from pathlib import Path

        path = Path(__file__).parent / "../../syu-react-frontend/src/constants/legal.ts"
        if not path.exists():
            pytest.skip("프론트엔드 소스가 없는 환경 (Docker 등)")

        parsed = parse_legal_defaults(path.read_text(encoding="utf-8"))
        assert parsed[OFFICER_NAME_FIELD]
        assert "@" in (parsed[CONTACT_EMAIL_FIELD] or "")
        assert "@" in (parsed[INQUIRY_EMAIL_FIELD] or "")
        assert parsed[VERSION_FIELD]
        assert len(parsed["termsHeadings"]) >= 5
        assert any(is_officer_section(h) for h in parsed["privacyHeadings"])
        # 마케팅 전문에도 보호책임자 조항이 있어야 앱이 본문을 다시 만들어 준다 —
        # 없으면 담당자가 바뀌었을 때 이 문서만 옛 이름으로 남는다.
        assert parsed["marketingHeadings"]
        assert any(is_officer_section(h) for h in parsed["marketingHeadings"])
        assert isinstance(parsed[MARKETING_CONSENT_ENABLED_FIELD], bool)


# ── legal.ts 원본 찾기 (저장소 → 스냅샷 폴백) ─────────────────────
#
# 여기서 고정하는 것은 **순서**다. 저장소 체크아웃이 있으면 그것을 봐야 하고
# (항상 최신), 없을 때만 배포 스냅샷으로 내려가야 한다. 순서가 뒤집히면
# 로컬에서 legal.ts를 고쳐도 대조표가 지난 배포의 사본을 계속 보여 준다.

def make_repo_layout(tmp_path, repo_text=None, snapshot_text=None, meta_text=None):
    """어드민 디렉터리를 흉내 낸 임시 트리를 만들고 그 경로를 돌려준다.

    admin/ 옆에 syu-react-frontend/가 있는 저장소 배치와, admin/ 만 있는
    컨테이너 배치를 인자 조합으로 함께 표현한다.
    """
    admin = tmp_path / "syu-react-admin"
    admin.mkdir()

    if repo_text is not None:
        constants = tmp_path / "syu-react-frontend" / "src" / "constants"
        constants.mkdir(parents=True)
        (constants / "legal.ts").write_text(repo_text, encoding="utf-8")

    if snapshot_text is not None:
        snapshot = admin / SNAPSHOT_DIR_NAME
        snapshot.mkdir()
        (snapshot / "legal.ts").write_text(snapshot_text, encoding="utf-8")
        if meta_text is not None:
            (snapshot / SNAPSHOT_META_NAME).write_text(meta_text, encoding="utf-8")

    return admin


META_SAMPLE = """# 손으로 고치지 마세요
capturedAt=2026-08-17 00:11:19 KST
commit=3540d8a
source=../syu-react-frontend/src/constants/legal.ts
"""


class TestParseSnapshotMeta:
    def test_key_value_줄을_읽는다(self):
        meta = parse_snapshot_meta(META_SAMPLE)
        assert meta[SNAPSHOT_CAPTURED_AT_KEY] == "2026-08-17 00:11:19 KST"
        assert meta[SNAPSHOT_COMMIT_KEY] == "3540d8a"

    def test_주석과_빈_줄은_건너뛴다(self):
        assert parse_snapshot_meta("# 주석\n\n  \ncommit=abc") == {"commit": "abc"}

    def test_형식이_깨져도_예외를_던지지_않는다(self):
        # META는 표시용 부가 정보다 — 이것 때문에 대조표가 막히면 주객이 전도된다.
        assert parse_snapshot_meta("등호가 없는 줄") == {}
        assert parse_snapshot_meta(None) == {}


class TestLoadLegalSource:
    def test_스냅샷이_없으면_저장소를_읽는다(self, tmp_path):
        base = make_repo_layout(tmp_path, repo_text="저장소판")
        source = load_legal_source(base)
        assert source.origin == "repo"
        assert source.text == "저장소판"
        assert source.is_snapshot is False

    def test_둘_다_있으면_저장소가_이긴다(self, tmp_path):
        # 순서가 뒤집히면 로컬에서 legal.ts를 고쳐도 지난 배포 사본이 표시된다.
        base = make_repo_layout(tmp_path, repo_text="저장소판", snapshot_text="스냅샷판")
        assert load_legal_source(base).text == "저장소판"

    def test_저장소가_없으면_스냅샷으로_내려간다(self, tmp_path):
        # 컨테이너에는 syu-react-admin/ 만 들어간다 — 이 폴백이 이번 작업의 목적이다.
        base = make_repo_layout(tmp_path, snapshot_text="스냅샷판", meta_text=META_SAMPLE)
        source = load_legal_source(base)
        assert source.origin == "snapshot"
        assert source.text == "스냅샷판"
        assert source.meta[SNAPSHOT_COMMIT_KEY] == "3540d8a"

    def test_스냅샷에_META가_없어도_읽는다(self, tmp_path):
        base = make_repo_layout(tmp_path, snapshot_text="스냅샷판")
        source = load_legal_source(base)
        assert source.origin == "snapshot"
        assert source.meta == {}

    def test_둘_다_없으면_예외를_던진다(self, tmp_path):
        # 호출부는 이 예외를 잡아 기존 안내문을 그대로 보여 준다.
        base = make_repo_layout(tmp_path)
        with pytest.raises(FileNotFoundError):
            load_legal_source(base)

    def test_실제_저장소에서는_repo로_잡힌다(self):
        from pathlib import Path

        if not (Path(__file__).parent / "../../syu-react-frontend").exists():
            pytest.skip("프론트엔드 소스가 없는 환경 (Docker 등)")
        assert load_legal_source().origin == "repo"


class TestSnapshotNotice:
    def test_저장소에서_읽었으면_아무것도_알리지_않는다(self, tmp_path):
        base = make_repo_layout(tmp_path, repo_text="저장소판")
        assert snapshot_notice(load_legal_source(base)) is None

    def test_스냅샷이면_시각과_커밋을_밝힌다(self, tmp_path):
        # 안 밝히면 배포 시점에 고정된 사본을 현재 코드로 착각한다.
        base = make_repo_layout(tmp_path, snapshot_text="스냅샷판", meta_text=META_SAMPLE)
        notice = snapshot_notice(load_legal_source(base))
        assert notice == "스냅샷 기준: 2026-08-17 00:11:19 KST (3540d8a)"

    def test_META가_없으면_모른다는_사실을_알린다(self, tmp_path):
        base = make_repo_layout(tmp_path, snapshot_text="스냅샷판")
        notice = snapshot_notice(load_legal_source(base))
        assert notice is not None
        assert "없습니다" in notice

    def test_None을_넘겨도_터지지_않는다(self):
        assert snapshot_notice(None) is None


# ── 드리프트 대조 ─────────────────────────────────────────────────

class TestCompareLegalDrift:
    def test_DB가_비면_전부_미설정으로_표시한다(self):
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {})
        assert set(df["상태"]) == {STATUS_UNSET}

    def test_값이_같으면_같음으로_표시한다(self):
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {OFFICER_NAME_FIELD: "김영원"})
        row = df[df["항목"].str.contains("성명")].iloc[0]
        assert row["상태"] == STATUS_SAME

    def test_값이_다르면_DB가_우선임을_알린다(self):
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {OFFICER_NAME_FIELD: "홍길동"})
        row = df[df["항목"].str.contains("성명")].iloc[0]
        assert row["상태"] == STATUS_DIFFERENT
        assert row["DB 값 (settings/legal)"] == "홍길동"

    def test_빈_문자열은_미설정으로_본다(self):
        # 어드민에서 값을 지우면 빈 문자열이 남는다 — 앱은 이때 코드 값으로 폴백한다.
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {OFFICER_NAME_FIELD: "   "})
        row = df[df["항목"].str.contains("성명")].iloc[0]
        assert row["상태"] == STATUS_UNSET

    def test_조항_수도_대조한다(self):
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {TERMS_SECTIONS_FIELD: SECTIONS})
        row = df[df["항목"] == "이용약관 조항 수"].iloc[0]
        assert row["DB 값 (settings/legal)"] == "2개"
        assert row["상태"] == STATUS_SAME

    def test_형식이_깨진_조항은_미설정으로_본다(self):
        # 앱이 폴백하는 상태와 표시가 일치해야 한다.
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {TERMS_SECTIONS_FIELD: [{"heading": "제 1 조"}]})
        row = df[df["항목"] == "이용약관 조항 수"].iloc[0]
        assert row["상태"] == STATUS_UNSET

    def test_전_칸이_문자열이다(self):
        # 혼합 타입 DataFrame이 Arrow 직렬화에서 프로세스를 죽인 전례가 있다.
        df = compare_legal_drift(parse_legal_defaults(LEGAL_TS_SAMPLE), {VERSION_FIELD: "2026-09-01"})
        assert all(isinstance(v, str) for v in df.to_numpy().ravel())

    def test_인자가_None이어도_터지지_않는다(self):
        assert not compare_legal_drift(None, None).empty


# ── 저장 / 되돌리기 ───────────────────────────────────────────────

class TestBuildLegalPayload:
    def test_관리_대상_필드만_담고_저장_시각을_남긴다(self):
        payload = build_legal_payload({OFFICER_NAME_FIELD: "홍길동", "몰래": "끼어든 값"}, {})
        assert payload[OFFICER_NAME_FIELD] == "홍길동"
        assert "몰래" not in payload
        assert payload[UPDATED_AT_FIELD]

    def test_첫_저장에는_보관본이_없다(self):
        payload = build_legal_payload({OFFICER_NAME_FIELD: "홍길동"}, {})
        assert PREVIOUS_LEGAL_FIELD not in payload

    def test_기존_값을_이전_버전으로_밀어_넣는다(self):
        current = {OFFICER_NAME_FIELD: "김영원", VERSION_FIELD: "2026-08-16"}
        payload = build_legal_payload({**current, OFFICER_NAME_FIELD: "홍길동"}, current)

        assert payload[PREVIOUS_LEGAL_FIELD] == current
        assert payload[PREVIOUS_UPDATED_AT_FIELD]

    def test_내용이_같으면_보관을_갱신하지_않는다(self):
        # 같은 값을 실수로 다시 저장했을 때 보관본까지 덮이면 되돌릴 곳이 사라진다.
        current = {OFFICER_NAME_FIELD: "김영원"}
        payload = build_legal_payload(dict(current), current)
        assert PREVIOUS_LEGAL_FIELD not in payload

    def test_한_필드만_고쳐도_나머지가_함께_보관된다(self):
        # 성명만 고치고 조항은 그대로 둔 저장도 한 번에 되돌릴 수 있어야 한다.
        current = {OFFICER_NAME_FIELD: "김영원", TERMS_SECTIONS_FIELD: SECTIONS}
        payload = build_legal_payload({**current, OFFICER_NAME_FIELD: "홍길동"}, current)

        assert payload[PREVIOUS_LEGAL_FIELD][TERMS_SECTIONS_FIELD] == SECTIONS

    def test_이전_보관본은_스냅샷에_끼어들지_않는다(self):
        # previousLegal 자체가 previousLegal 안으로 들어가면 문서가 계속 불어난다.
        current = {OFFICER_NAME_FIELD: "김영원", PREVIOUS_LEGAL_FIELD: {OFFICER_NAME_FIELD: "옛담당자"}}
        payload = build_legal_payload({OFFICER_NAME_FIELD: "홍길동"}, current)

        assert PREVIOUS_LEGAL_FIELD not in payload[PREVIOUS_LEGAL_FIELD]

    def test_스냅샷은_관리_대상만_담는다(self):
        assert snapshot_legal({OFFICER_NAME_FIELD: "김영원", UPDATED_AT_FIELD: "무시"}) == {
            OFFICER_NAME_FIELD: "김영원"
        }
        assert snapshot_legal(None) == {}


class TestRollbackLegal:
    def test_보관본이_있어야_되돌릴_수_있다(self):
        assert not can_rollback_legal({})
        assert not can_rollback_legal(None)
        assert can_rollback_legal({PREVIOUS_LEGAL_FIELD: {OFFICER_NAME_FIELD: "김영원"}})

    def test_되돌리면_현재와_이전이_뒤바뀐다(self):
        current = {OFFICER_NAME_FIELD: "홍길동"}
        previous = {OFFICER_NAME_FIELD: "김영원"}
        payload = build_legal_rollback_payload(current, previous)

        assert payload[OFFICER_NAME_FIELD] == "김영원"
        assert payload[PREVIOUS_LEGAL_FIELD] == current

    def test_두_번_되돌리면_원상복구된다(self):
        current = {OFFICER_NAME_FIELD: "홍길동"}
        previous = {OFFICER_NAME_FIELD: "김영원"}

        first = build_legal_rollback_payload(current, previous)
        second = build_legal_rollback_payload(first, first[PREVIOUS_LEGAL_FIELD])

        assert second[OFFICER_NAME_FIELD] == "홍길동"

    def test_이전에_없던_필드는_명시적으로_지운다(self):
        # 쓰기가 merge라서 빼 두면 지금 값이 그대로 남는다 — "되돌렸다"고
        # 말하고 일부만 되돌린 상태가 된다.
        current = {OFFICER_NAME_FIELD: "홍길동", TERMS_SECTIONS_FIELD: SECTIONS}
        payload = build_legal_rollback_payload(current, {OFFICER_NAME_FIELD: "김영원"})

        assert payload[TERMS_SECTIONS_FIELD] is None

    def test_비교표가_두_버전을_나란히_놓는다(self):
        df = compare_legal_versions(
            {OFFICER_NAME_FIELD: "홍길동", TERMS_SECTIONS_FIELD: SECTIONS},
            {OFFICER_NAME_FIELD: "김영원"},
        )
        assert len(df) == 2
        assert df.iloc[0]["보호책임자"] == "홍길동"
        assert df.iloc[1]["보호책임자"] == "김영원"
        assert df.iloc[1]["약관 조항"] == "(미설정)"


# ── 저장 이력 (settings_history) ──────────────────────────────────
#
# 되돌리기는 1단계뿐이라 "직전 것"까지만 안다. 약관은 동의 증빙 대상이라
# "그 사람이 동의한 시점에 무엇이 걸려 있었나"를 답할 수 있어야 하고, 그
# 답의 재료가 이력 payload다. 그래서 여기서 고정하는 것은 두 가지다:
#   - payload를 **가공하지 않고 통째로** 남기는가 (요약만 남기면 증빙이 안 된다)
#   - savedAt이 settings/legal의 updatedAt과 **같은 값**인가 (어긋나면 못 찾는다)

def legal_entry(saved_at, version="v1", terms=1, privacy=0, officer="김영원"):
    """이력 문서 한 벌을 흉내 낸다."""
    return {
        SAVED_AT_FIELD: saved_at,
        UPDATED_AT_FIELD: saved_at,
        VERSION_FIELD: version,
        OFFICER_NAME_FIELD: officer,
        TERMS_SECTIONS_FIELD: [
            {"heading": f"제 {i} 조", "body": "본문"} for i in range(1, terms + 1)
        ],
        PRIVACY_SECTIONS_FIELD: [
            {"heading": f"{i}. 항목", "body": "본문"} for i in range(1, privacy + 1)
        ],
    }


class TestBuildHistoryPayload:
    def test_저장_payload를_통째로_담는다(self):
        # 요약만 남기면 "그때 그 조항 본문이 무엇이었나"를 답할 수 없다.
        payload = build_legal_payload(
            {
                VERSION_FIELD: "2026-08-16",
                TERMS_SECTIONS_FIELD: [{"heading": "제 1 조", "body": "본문입니다"}],
            }
        )
        entry = build_history_payload(payload)

        assert entry[VERSION_FIELD] == "2026-08-16"
        assert entry[TERMS_SECTIONS_FIELD][0]["body"] == "본문입니다"

    def test_savedAt이_updatedAt과_같다(self):
        # 어긋나면 settings/legal의 갱신 시각으로 이력을 찾을 때 매칭에 실패한다.
        payload = build_legal_payload({VERSION_FIELD: "v1"})
        entry = build_history_payload(payload)
        assert entry[SAVED_AT_FIELD] == payload[UPDATED_AT_FIELD]

    def test_updatedAt이_없으면_지금_시각을_찍는다(self):
        entry = build_history_payload({VERSION_FIELD: "v1"})
        assert entry[SAVED_AT_FIELD]

    def test_원본_payload를_건드리지_않는다(self):
        payload = build_legal_payload({VERSION_FIELD: "v1"})
        build_history_payload(payload)
        assert SAVED_AT_FIELD not in payload

    def test_문서_id는_저장_시각이다(self):
        # id가 시각이라 서로 부딪히지 않고, id순 정렬이 곧 시각순 정렬이 된다.
        entry = build_history_payload(build_legal_payload({VERSION_FIELD: "v1"}))
        assert history_doc_id(entry) == entry[SAVED_AT_FIELD]


class TestHistoryRows:
    def test_최신이_맨_위다(self):
        rows = build_history_rows(
            [
                legal_entry("2026-08-01T00:00:00+00:00", version="옛것"),
                legal_entry("2026-08-17T00:00:00+00:00", version="새것"),
            ]
        )
        assert list(rows["문서 버전"]) == ["새것", "옛것"]

    def test_저장_시각_버전_조항수_보호책임자를_보여_준다(self):
        rows = build_history_rows(
            [legal_entry("2026-08-17T00:00:00+00:00", terms=3, privacy=2, officer="홍길동")]
        )
        row = rows.iloc[0]
        assert row["약관 조항"] == "3개"
        assert row["처리방침 조항"] == "2개"
        assert row["보호책임자"] == "홍길동"
        assert row["저장 시각"]

    def test_최근_20건까지만_보여_준다(self):
        entries = [legal_entry(f"2026-08-{day:02d}T00:00:00+00:00") for day in range(1, 26)]
        assert len(build_history_rows(entries)) == HISTORY_LIMIT

    def test_기록이_없어도_열_이름은_유지된다(self):
        # 빈 DataFrame이 열까지 잃으면 st.dataframe이 표 대신 빈 칸을 그린다.
        rows = build_history_rows([])
        assert "저장 시각" in rows.columns
        assert rows.empty

    def test_savedAt이_없는_문서는_맨_아래로_민다(self):
        rows = build_history_rows(
            [{VERSION_FIELD: "시각없음"}, legal_entry("2026-08-17T00:00:00+00:00", version="정상")]
        )
        assert list(rows["문서 버전"]) == ["정상", "시각없음"]

    def test_dict이_아닌_항목은_버린다(self):
        assert len(build_history_rows([None, "문자열", legal_entry("2026-08-17T00:00:00+00:00")])) == 1


class TestHistoryDetail:
    def test_라벨은_표와_같은_순서다(self):
        # 라벨 위치로 원본 항목을 되찾으므로 순서가 어긋나면 엉뚱한 상세가 뜬다.
        entries = [
            legal_entry("2026-08-01T00:00:00+00:00", version="옛것"),
            legal_entry("2026-08-17T00:00:00+00:00", version="새것"),
        ]
        labels = history_entry_labels(entries)
        assert "새것" in labels[0]
        assert list(build_history_rows(entries)["문서 버전"]) == ["새것", "옛것"]

    def test_조항_제목을_문서별로_펼친다(self):
        titles = history_section_titles(
            legal_entry("2026-08-17T00:00:00+00:00", terms=2, privacy=1)
        )
        assert list(titles["문서"]) == ["이용약관", "이용약관", "개인정보 처리방침"]
        assert titles.iloc[0]["조항 제목"] == "제 1 조"

    def test_운영_정보만_바꾼_저장은_조항이_비어_있다(self):
        titles = history_section_titles({SAVED_AT_FIELD: "2026-08-17T00:00:00+00:00"})
        assert titles.empty
        assert "조항 제목" in titles.columns


# ── 공지 ──────────────────────────────────────────────────────────

class TestNotice:
    def test_저장_시_active를_불리언으로_굳힌다(self):
        # 앱은 active === true일 때만 배너를 띄운다 — 문자열이 들어가면
        # 켠 줄 알았는데 안 뜨는 상태가 된다.
        payload = build_notice_payload("켜짐", " 점검 예정입니다. ")
        assert payload[NOTICE_ACTIVE_FIELD] is True
        assert payload[NOTICE_MESSAGE_FIELD] == "점검 예정입니다."
        assert payload[UPDATED_AT_FIELD]

    def test_끄면_False로_저장한다(self):
        assert build_notice_payload(False, "본문")[NOTICE_ACTIVE_FIELD] is False
        assert build_notice_payload(None, "본문")[NOTICE_ACTIVE_FIELD] is False

    def test_앱과_같은_판정으로_게시_여부를_알린다(self):
        assert resolve_notice({NOTICE_ACTIVE_FIELD: True, NOTICE_MESSAGE_FIELD: "공지"})["active"]
        # 본문이 비면 켜져 있어도 뜨지 않는다
        assert not resolve_notice({NOTICE_ACTIVE_FIELD: True, NOTICE_MESSAGE_FIELD: "  "})["active"]
        # 불리언 true가 아니면 켜지 않는다
        assert not resolve_notice({NOTICE_ACTIVE_FIELD: "true", NOTICE_MESSAGE_FIELD: "공지"})["active"]
        assert not resolve_notice(None)["active"]

    def test_상태_문구가_세_경우를_구분한다(self):
        게시중 = notice_status_label({NOTICE_ACTIVE_FIELD: True, NOTICE_MESSAGE_FIELD: "공지"})
        본문없음 = notice_status_label({NOTICE_ACTIVE_FIELD: True, NOTICE_MESSAGE_FIELD: ""})
        꺼짐 = notice_status_label({NOTICE_ACTIVE_FIELD: False, NOTICE_MESSAGE_FIELD: "공지"})

        assert 게시중 != 본문없음 != 꺼짐
        assert "본문이 비어" in 본문없음


# ── 마케팅 수신 동의 표시 스위치 ──────────────────────────────────
#
# 조항 배열과 달리 불리언 하나뿐이라 규칙이 단순해 보이지만, 여기서 고정하는
# 것은 **"값이 없는 것"과 "false"가 다른 뜻**이라는 계약이다. 둘을 섞으면
# 운영팀이 꺼 둔 항목이 되살아나 끄는 방법이 사라진다.

class TestMarketingEnabled:
    def test_DB에_값이_없으면_코드_기본값을_쓴다(self):
        assert resolve_marketing_enabled({}) is MARKETING_CONSENT_ENABLED_DEFAULT
        assert resolve_marketing_enabled(None) is MARKETING_CONSENT_ENABLED_DEFAULT

    def test_불리언_값은_그대로_따른다(self):
        assert resolve_marketing_enabled({MARKETING_CONSENT_ENABLED_FIELD: False}) is False
        assert resolve_marketing_enabled({MARKETING_CONSENT_ENABLED_FIELD: True}) is True

    def test_불리언이_아니면_코드_기본값으로_폴백한다(self):
        # 문자열 "false"를 false로 읽어 주면 오타 하나가 조용히 반대 의미가 된다.
        # 앱(useSettingsStore.readBoolean)과 같은 판정이어야 미리보기가 맞는다.
        assert (
            resolve_marketing_enabled({MARKETING_CONSENT_ENABLED_FIELD: "false"})
            is MARKETING_CONSENT_ENABLED_DEFAULT
        )
        assert (
            resolve_marketing_enabled({MARKETING_CONSENT_ENABLED_FIELD: 0})
            is MARKETING_CONSENT_ENABLED_DEFAULT
        )

    def test_상태_문구가_세_경우를_구분한다(self):
        미설정 = marketing_status_label({})
        표시 = marketing_status_label({MARKETING_CONSENT_ENABLED_FIELD: True})
        숨김 = marketing_status_label({MARKETING_CONSENT_ENABLED_FIELD: False})

        assert 미설정 != 표시 != 숨김
        assert "미설정" in 미설정
        assert "숨김" in 숨김

    def test_저장_시_불리언으로_굳혀_담는다(self):
        # 앱은 불리언일 때만 DB 값을 쓴다 — 문자열이 들어가면 껐는데 켜져 있는
        # (또는 그 반대의) 상태가 된다.
        payload = build_legal_payload({MARKETING_CONSENT_ENABLED_FIELD: False}, {})
        assert payload[MARKETING_CONSENT_ENABLED_FIELD] is False

    def test_되돌리기가_표시_설정도_함께_되돌린다(self):
        # 문안은 그대로인데 스위치만 바뀐 저장도 게시되는 동의 절차의 변경이다.
        current = {MARKETING_CONSENT_ENABLED_FIELD: False, VERSION_FIELD: "v2"}
        previous = {MARKETING_CONSENT_ENABLED_FIELD: True, VERSION_FIELD: "v1"}

        payload = build_legal_rollback_payload(current, previous)

        assert payload[MARKETING_CONSENT_ENABLED_FIELD] is True
        assert payload[PREVIOUS_LEGAL_FIELD][MARKETING_CONSENT_ENABLED_FIELD] is False

    def test_설정하기_전_상태로도_되돌아간다(self):
        # 이전 스냅샷에 없던 필드는 None으로 지워야 앱이 코드 기본값으로
        # 폴백한다 — 빼 두면 merge라서 지금 값이 그대로 남는다.
        payload = build_legal_rollback_payload({MARKETING_CONSENT_ENABLED_FIELD: False}, {})

        assert payload[MARKETING_CONSENT_ENABLED_FIELD] is None

    def test_드리프트_표가_켜짐과_꺼짐을_구분한다(self):
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)  # 코드 기본값 = True

        같음 = compare_legal_drift(code, {MARKETING_CONSENT_ENABLED_FIELD: True})
        다름 = compare_legal_drift(code, {MARKETING_CONSENT_ENABLED_FIELD: False})
        미설정 = compare_legal_drift(code, {})

        항목 = "마케팅 동의 항목 표시"
        assert 같음[같음["항목"] == 항목].iloc[0]["상태"] == STATUS_SAME
        assert 다름[다름["항목"] == 항목].iloc[0]["상태"] == STATUS_DIFFERENT
        assert 다름[다름["항목"] == 항목].iloc[0]["DB 값 (settings/legal)"] == "숨김"
        assert 미설정[미설정["항목"] == 항목].iloc[0]["상태"] == STATUS_UNSET

    def test_마케팅_조항_수도_대조한다(self):
        code = parse_legal_defaults(LEGAL_TS_SAMPLE)
        df = compare_legal_drift(code, {MARKETING_SECTIONS_FIELD: SECTIONS})
        row = df[df["항목"] == "마케팅 동의 조항 수"].iloc[0]
        assert row["DB 값 (settings/legal)"] == "2개"
        assert row["상태"] == STATUS_SAME

    def test_이력_표에_마케팅_열이_있다(self):
        # 증빙 조회는 "그때 마케팅 항목이 걸려 있었나"까지 답해야 한다.
        entry = {
            SAVED_AT_FIELD: "2026-08-18T10:00:00",
            MARKETING_SECTIONS_FIELD: SECTIONS,
            MARKETING_CONSENT_ENABLED_FIELD: False,
        }
        df = build_history_rows([entry])

        assert df.iloc[0]["마케팅 조항"] == "2개"
        assert df.iloc[0]["마케팅 표시"] == "숨김"

    def test_이력_상세가_마케팅_조항도_보여_준다(self):
        entry = {SAVED_AT_FIELD: "2026-08-18T10:00:00", MARKETING_SECTIONS_FIELD: SECTIONS}
        titles = history_section_titles(entry)

        assert set(titles["문서"]) == {"마케팅 정보 수신 동의"}
        assert len(titles) == 2


# ── 프론트엔드 계약 미러 ──────────────────────────────────────────

class TestFrontendContract:
    """필드 이름이 프론트 firestoreKeys.ts와 어긋나면 저장해도 앱이 못 읽는다.

    TypeScript 컴파일러가 Python 쪽까지 검사해 주지 않으므로, 값 자체를
    여기서 고정한다.
    """

    def test_필드_이름이_프론트와_같다(self):
        assert TERMS_SECTIONS_FIELD == "termsSections"
        assert PRIVACY_SECTIONS_FIELD == "privacySections"
        assert MARKETING_SECTIONS_FIELD == "marketingSections"
        assert OFFICER_NAME_FIELD == "officerName"
        assert CONTACT_EMAIL_FIELD == "contactEmail"
        assert INQUIRY_EMAIL_FIELD == "inquiryEmail"
        assert VERSION_FIELD == "version"
        assert MARKETING_CONSENT_ENABLED_FIELD == "marketingConsentEnabled"
        assert NOTICE_ACTIVE_FIELD == "active"
        assert NOTICE_MESSAGE_FIELD == "message"

    def test_표시_기본값이_프론트_코드_상수와_같다(self):
        # 어긋나면 어드민이 "코드 기본값은 표시함"이라고 말하는데 앱은 숨기는
        # (또는 그 반대의) 상태가 된다 — 저장소가 있는 환경에서 실제로 대조한다.
        from pathlib import Path

        path = Path(__file__).parent / "../../syu-react-frontend/src/constants/legal.ts"
        if not path.exists():
            pytest.skip("프론트엔드 소스가 없는 환경 (Docker 등)")

        parsed = parse_legal_defaults(path.read_text(encoding="utf-8"))
        assert parsed[MARKETING_CONSENT_ENABLED_FIELD] is MARKETING_CONSENT_ENABLED_DEFAULT

    def test_보호책임자_본문이_프론트_생성물과_같다(self):
        # legal.ts의 buildOfficerSectionBody와 글자 하나까지 같아야 어드민
        # 미리보기가 앱 화면과 일치한다.
        assert build_officer_section_body("홍길동", "a@b.com") == (
            "개인정보 처리에 관한 문의, 불만 처리, 피해 구제 요청은 아래 보호책임자에게 연락해 주시기 바랍니다.\n"
            "- 성명: 홍길동\n"
            f"- 소속: {OFFICER_AFFILIATION}\n"
            "- 연락처: a@b.com"
        )
