# settings_utils.py
# 약관·운영 정보·공지(settings 컬렉션) 관리의 순수 함수 모듈.
#
# export_utils.py·csv_validation.py와 같은 계약이다 — Streamlit·firebase_admin
# 의존성이 없어 pytest로 직접 호출해 검증한다. streamlit_app.py는 화면과
# Firestore I/O만 맡고, 형식 검사·버전 보관·드리프트 대조 같은 판단은 전부
# 여기에 둔다.
#
# ── settings/{legal,notice} 스키마 출처 ────────────────────────────
# 필드 이름은 프론트엔드 src/api/firestoreKeys.ts의 SETTINGS_* 상수와 미러
# 관계다. 해석 규칙(무엇이 있으면 무엇으로 폴백하는가)은
# src/store/useSettingsStore.ts가 정본이며, 이 파일의 preview_* 함수는 그
# 규칙을 **그대로 옮긴 것**이다 — 어드민 미리보기가 앱 화면과 달라지면
# 운영팀이 잘못된 것을 보고 저장하게 된다.
#
# 프론트 쪽 규칙을 바꾸면 여기도 함께 고쳐야 한다.

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from export_utils import (
    PREVIOUS_UPDATED_AT_FIELD,
    format_timestamp,
    now_iso,
)

# ── Firestore 필드명 (프론트 firestoreKeys.ts와 미러) ──────────────
SETTINGS_COLLECTION = "settings"
LEGAL_DOC_ID = "legal"
NOTICE_DOC_ID = "notice"

TERMS_SECTIONS_FIELD = "termsSections"
PRIVACY_SECTIONS_FIELD = "privacySections"
MARKETING_SECTIONS_FIELD = "marketingSections"
OFFICER_NAME_FIELD = "officerName"
CONTACT_EMAIL_FIELD = "contactEmail"
INQUIRY_EMAIL_FIELD = "inquiryEmail"
VERSION_FIELD = "version"
MARKETING_CONSENT_ENABLED_FIELD = "marketingConsentEnabled"
UPDATED_AT_FIELD = "updatedAt"

NOTICE_ACTIVE_FIELD = "active"
NOTICE_MESSAGE_FIELD = "message"

# 마케팅 항목 표시의 코드 기본값. 프론트 legal.ts의
# MARKETING_CONSENT_ENABLED_DEFAULT와 미러다 — 값이 없을 때 앱이 무엇을
# 하는지를 어드민 화면이 정확히 말할 수 있어야 한다.
MARKETING_CONSENT_ENABLED_DEFAULT = True

# 되돌리기용 직전 스냅샷. CSV의 previousCsvText와 같은 역할이지만, 여기서는
# 문자열 하나가 아니라 **관리 대상 필드 묶음**을 통째로 담는다 — 성명만 고치고
# 조항은 그대로 둔 저장도 한 번에 되돌릴 수 있어야 하기 때문이다.
PREVIOUS_LEGAL_FIELD = "previousLegal"

# 이 화면이 소유하는 필드. 되돌리기·드리프트 대조의 범위이기도 하다.
MANAGED_LEGAL_FIELDS = (
    TERMS_SECTIONS_FIELD,
    PRIVACY_SECTIONS_FIELD,
    MARKETING_SECTIONS_FIELD,
    OFFICER_NAME_FIELD,
    CONTACT_EMAIL_FIELD,
    INQUIRY_EMAIL_FIELD,
    VERSION_FIELD,
    MARKETING_CONSENT_ENABLED_FIELD,
)

# 보호책임자 소속. 프론트 legal.ts의 OFFICER_AFFILIATION과 미러이며, 팀이
# 해체되기 전까지 바뀔 일이 없어 DB화하지 않았다.
OFFICER_AFFILIATION = "삼육대학교 산학협력 연구 프로젝트팀"

# 조항 편집 표의 열 이름. st.data_editor ↔ Firestore 왕복에 쓴다.
SECTION_HEADING_COLUMN = "조항 제목"
SECTION_BODY_COLUMN = "본문"


# ── 보호책임자 조항 (프론트 legal.ts와 미러) ──────────────────────

def is_officer_section(heading) -> bool:
    """처리방침에서 보호책임자 조항을 찾아내는 판별식.

    조항 번호가 아니라 제목의 낱말로 찾는다 — 조항을 추가·삭제하면 번호가
    밀리기 때문이다. 프론트 legal.ts의 isOfficerSection과 같은 규칙이다.
    """
    return "보호책임자" in str(heading or "")


def build_officer_section_body(officer_name, contact_email, affiliation=OFFICER_AFFILIATION) -> str:
    """처리방침 보호책임자 조항 본문을 성명·연락처로부터 만든다.

    프론트 legal.ts의 buildOfficerSectionBody와 **글자 하나까지 같아야 한다** —
    어드민 미리보기와 앱 화면이 달라지면 운영팀이 확인한 것과 다른 문서가
    게시된다.
    """
    return "\n".join(
        [
            "개인정보 처리에 관한 문의, 불만 처리, 피해 구제 요청은 아래 보호책임자에게 연락해 주시기 바랍니다.",
            f"- 성명: {officer_name}",
            f"- 소속: {affiliation}",
            f"- 연락처: {contact_email}",
        ]
    )


# ── 조항 배열 형식 ────────────────────────────────────────────────

def normalize_sections(value):
    """조항 배열을 검사해 정규화한다. 형식이 깨졌으면 None.

    프론트 useSettingsStore.isLegalSectionArray와 같은 판정이다. **한 조항이라도
    형식이 깨지면 배열 전체를 버린다** — 절반만 적용하면 조항이 중간에 사라진
    법무 문서가 게시된다.
    """
    if not isinstance(value, list) or not value:
        return None

    normalized = []
    for item in value:
        if not isinstance(item, dict):
            return None
        heading = item.get("heading")
        body = item.get("body")
        if not isinstance(heading, str) or heading.strip() == "":
            return None
        if not isinstance(body, str):
            return None
        normalized.append({"heading": heading, "body": body})
    return normalized


def sections_to_records(sections):
    """조항 배열을 st.data_editor용 표 레코드로. 형식이 깨졌으면 빈 표."""
    normalized = normalize_sections(sections) or []
    return [
        {SECTION_HEADING_COLUMN: item["heading"], SECTION_BODY_COLUMN: item["body"]}
        for item in normalized
    ]


def records_to_sections(records):
    """표 레코드를 Firestore에 넣을 조항 배열로.

    제목이 빈 행은 버린다 — data_editor가 num_rows="dynamic"이면 사용자가
    아무것도 적지 않은 빈 행을 남기기 쉬운데, 그대로 저장하면 앱의 형식 검사에
    걸려 **문서 전체가 폴백**된다(고친 내용이 통째로 안 보이게 된다).
    """
    sections = []
    for record in records or []:
        heading = str(record.get(SECTION_HEADING_COLUMN, "") or "").strip()
        body = str(record.get(SECTION_BODY_COLUMN, "") or "")
        if heading == "":
            continue
        sections.append({"heading": heading, "body": body})
    return sections


def validate_sections(sections, label="문서"):
    """저장 전 조항 배열 검사. (errors, warnings) 두 목록을 돌려준다.

    errors가 하나라도 있으면 저장을 막는다 — 법무 문서는 잘못 올라가면
    사용자에게 곧바로 게시되고, 앱은 형식 오류를 화면에 보여 주지 않고
    조용히 폴백하므로 운영팀이 알아채기 어렵다.
    """
    errors = []
    warnings = []

    if not sections:
        errors.append(f"{label}: 조항이 하나도 없습니다. 최소 한 조항은 있어야 저장할 수 있습니다.")
        return errors, warnings

    headings = [item["heading"] for item in sections]
    duplicates = sorted({h for h in headings if headings.count(h) > 1})
    if duplicates:
        # 앱은 heading을 목록 key로 쓴다 — 중복이면 React가 조항 하나를 빠뜨린다.
        errors.append(f"{label}: 조항 제목이 중복됩니다 — {', '.join(duplicates)}")

    for item in sections:
        if item["body"].strip() == "":
            warnings.append(f"{label}: '{item['heading']}' 조항의 본문이 비어 있습니다.")

    return errors, warnings


def preview_privacy_sections(sections, officer_name, contact_email):
    """앱이 실제로 그릴 처리방침 조항을 만든다 (보호책임자 조항은 자동 생성).

    성명·연락처는 구조화 필드가 정본이고 조항 산문은 그 표현이라는 규약이라,
    앱은 보호책임자 조항 본문을 **항상** 필드에서 다시 만든다
    (useSettingsStore.withOfficerSection). 미리보기도 같은 결과를 보여 줘야
    운영팀이 "내가 적은 대로 나가겠구나"를 정확히 판단할 수 있다.
    """
    result = []
    for item in normalize_sections(sections) or []:
        if is_officer_section(item["heading"]):
            result.append(
                {
                    "heading": item["heading"],
                    "body": build_officer_section_body(officer_name, contact_email),
                }
            )
        else:
            result.append(dict(item))
    return result


# ── 마케팅 수신 동의 표시 스위치 ──────────────────────────────────
#
# 조항 배열과 달리 불리언 하나뿐이지만, 규칙이 따로 필요한 이유는 **"값이
# 없는 것"과 "false"가 다른 뜻**이기 때문이다. 문자열 필드는 빈 값을 "지운 셈"
# 으로 접어도 되지만(readString), 불리언에서 같은 짓을 하면 운영팀이 꺼 둔
# 항목이 되살아나 끄는 방법이 사라진다.

def resolve_marketing_enabled(doc_data) -> bool:
    """동의 화면에 마케팅 항목이 표시되는가 (useSettingsStore.readBoolean과 미러).

    **진짜 불리언일 때만** DB 값을 쓴다. 문자열 "false"를 false로 읽어 주지
    않는 것이 요점이다 — 그렇게 관대하면 오타 하나가 조용히 반대 의미가 된다.
    """
    doc_data = doc_data if isinstance(doc_data, dict) else {}
    value = doc_data.get(MARKETING_CONSENT_ENABLED_FIELD)
    if isinstance(value, bool):
        return value
    return MARKETING_CONSENT_ENABLED_DEFAULT


def marketing_status_label(doc_data) -> str:
    """마케팅 항목 표시 상태를 한 줄로. 화면 상단 배지에 쓴다.

    폴백(DB 미설정)과 명시적으로 켠 상태를 구분해 말한다 — 둘 다 화면에는
    똑같이 보이지만, "아직 정하지 않았다"와 "켜기로 정했다"는 다른 사실이다.
    """
    doc_data = doc_data if isinstance(doc_data, dict) else {}
    value = doc_data.get(MARKETING_CONSENT_ENABLED_FIELD)

    if not isinstance(value, bool):
        state = "표시함" if MARKETING_CONSENT_ENABLED_DEFAULT else "숨김"
        return f"DB 미설정 — 코드 기본값({state})이 적용됩니다"
    if value:
        return "표시함 — 동의 화면에 마케팅 수신 동의 항목이 나옵니다"
    return "숨김 — 동의 화면에서 마케팅 수신 동의 항목이 빠집니다"


def sections_to_text(sections) -> str:
    """조항 배열을 사람이 읽는 전문 텍스트로. 미리보기 표시용이다."""
    blocks = []
    for item in normalize_sections(sections) or []:
        blocks.append(f"{item['heading']}\n{item['body']}")
    return "\n\n".join(blocks)


# ── 코드 기본값(legal.ts) 파싱 ────────────────────────────────────

_STRING_LITERAL = r"'((?:[^'\\]|\\.)*)'"


def _find_const(source, name):
    match = re.search(rf"export const {name}\s*=\s*{_STRING_LITERAL}\s*;", source)
    return match.group(1).replace("\\'", "'") if match else None


def _find_bool_const(source, name):
    """따옴표 없는 불리언 상수. 찾지 못하면 None (= "코드 기본값을 모른다")."""
    match = re.search(rf"export const {name}\s*=\s*(true|false)\s*;", source)
    return match.group(1) == "true" if match else None


def _find_headings(chunk):
    return [m.replace("\\'", "'") for m in re.findall(rf"heading:\s*{_STRING_LITERAL}", chunk)]


#: 문서별 조항 배열이 시작되는 지점의 표식. **선언 순서대로** 적는다 —
#: 아래 _split_document_chunks가 이 순서로 경계를 자른다.
#:
#: MARKETING만 콜론까지 적는 이유는 같은 접두사를 가진 상수
#: (MARKETING_CONSENT_ENABLED_DEFAULT)가 파일에 함께 있어서다. 콜론을 빼면
#: 그쪽이 먼저 걸려 경계가 엉뚱한 곳에 잡힌다.
_DOCUMENT_MARKERS = (
    ("termsHeadings", "export const TERMS"),
    ("privacyHeadings", "export const PRIVACY"),
    ("marketingHeadings", "export const MARKETING:"),
)


def _split_document_chunks(source):
    """legal.ts 본문을 문서별 구간으로 자른다. 없는 문서는 빈 문자열.

    문서가 셋으로 늘면서 `앞/뒤` 두 조각으로는 부족해졌다 — 처리방침 구간을
    파일 끝까지로 잡으면 그 뒤의 마케팅 조항 제목이 처리방침 것으로 세어진다
    (드리프트 표의 조항 수가 조용히 틀린다).
    """
    chunks = {key: "" for key, _ in _DOCUMENT_MARKERS}
    found = [(key, source.find(marker)) for key, marker in _DOCUMENT_MARKERS]
    found = sorted([(key, pos) for key, pos in found if pos != -1], key=lambda kv: kv[1])

    for index, (key, pos) in enumerate(found):
        end = found[index + 1][1] if index + 1 < len(found) else len(source)
        chunks[key] = source[pos:end]
    return chunks


def parse_legal_defaults(source):
    """프론트 constants/legal.ts에서 코드 기본값을 뽑는다.

    **조항 본문까지 파싱하지는 않는다.** 본문은 이스케이프와 템플릿 리터럴이
    섞인 TypeScript 문자열이라 정규식으로 복원하면 조용히 틀린다 — 틀린 본문을
    "코드 기본값"이라며 보여 주는 것이 아예 안 보여 주는 것보다 나쁘다.
    대조에 필요한 만큼(운영 정보 4종 + 표시 스위치 + 조항 제목 목록)만 뽑는다.

    파일을 못 읽는 환경(어드민 디렉터리만 복사한 Docker 컨테이너)에서는 호출부가
    try/except로 감싸 이 함수를 건너뛴다 — Seed 기능과 같은 한계다.
    """
    source = source or ""
    chunks = _split_document_chunks(source)

    return {
        OFFICER_NAME_FIELD: _find_const(source, "OFFICER_NAME"),
        CONTACT_EMAIL_FIELD: _find_const(source, "CONTACT_EMAIL"),
        INQUIRY_EMAIL_FIELD: _find_const(source, "INQUIRY_EMAIL"),
        VERSION_FIELD: _find_const(source, "LEGAL_VERSION"),
        MARKETING_CONSENT_ENABLED_FIELD: _find_bool_const(
            source, "MARKETING_CONSENT_ENABLED_DEFAULT"
        ),
        **{key: _find_headings(chunk) for key, chunk in chunks.items()},
    }


# ── legal.ts 원본 찾기 (저장소 → 스냅샷 2순위 폴백) ────────────────
#
# 어드민이 Cloud Run으로 옮겨가면서 컨테이너에는 syu-react-admin/만 들어간다.
# 그래서 저장소 상대 경로(`../syu-react-frontend/...`)가 없고, 드리프트 대조표가
# 통째로 접혔다 — 설계된 폴백이지만 이제 웹 어드민이 주 창구라 "코드 기본값이
# 무엇인지" 를 운영팀이 볼 수 없다는 뜻이 된다.
#
# 그래서 배포 스크립트(deploy_cloudrun.sh)가 legal.ts를 frontend_snapshot/으로
# 복사해 이미지에 함께 싣는다. 여기서는 두 곳을 순서대로 본다:
#   ① 저장소 체크아웃 — 로컬·Streamlit Cloud. 항상 최신이다.
#   ② frontend_snapshot/ — 컨테이너. **배포 시점에 고정된 사본**이므로
#      화면에 스냅샷 시각과 커밋을 함께 밝혀야 한다. 안 밝히면 운영팀이
#      낡은 기본값을 현재 코드로 착각한다.
#
# 두 경로 모두 __file__ 기준 상대 경로다 (DATA_DIR·check_csv_sync.py와 같은 관습).

#: 스냅샷이 사는 폴더. 배포 스크립트가 만드는 생성물이라 커밋하지 않는다
#: (루트 .gitignore에 등록). .gcloudignore·.dockerignore에서는 **제외하지
#: 않는다** — 업로드되고 이미지에 복사되는 것이 목적이기 때문이다.
SNAPSHOT_DIR_NAME = "frontend_snapshot"
SNAPSHOT_META_NAME = "META"

#: 찾는 순서 그대로. 앞의 것이 있으면 뒤는 보지 않는다.
LEGAL_SOURCE_RELPATHS = (
    ("repo", "../syu-react-frontend/src/constants/legal.ts"),
    ("snapshot", f"{SNAPSHOT_DIR_NAME}/legal.ts"),
)

#: META의 키. 배포 스크립트가 쓰고 여기서 읽는다.
SNAPSHOT_CAPTURED_AT_KEY = "capturedAt"
SNAPSHOT_COMMIT_KEY = "commit"


def _module_dir() -> Path:
    return Path(__file__).parent


@dataclass(frozen=True)
class LegalSource:
    """legal.ts를 어디서 읽었는가. text는 parse_legal_defaults에 그대로 넘긴다."""

    origin: str  # "repo" | "snapshot"
    path: Path
    text: str
    meta: dict = field(default_factory=dict)

    @property
    def is_snapshot(self) -> bool:
        return self.origin == "snapshot"


def parse_snapshot_meta(text) -> dict:
    """frontend_snapshot/META를 key=value 줄 단위로 읽는다.

    형식이 깨졌거나 파일이 없어도 예외를 던지지 않는다 — META는 **표시용
    부가 정보**이고, 이것 때문에 드리프트 대조 자체가 막히면 주객이 전도된다.
    """
    meta = {}
    for line in str(text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key:
            meta[key] = value.strip()
    return meta


def load_legal_source(base_dir=None) -> LegalSource:
    """legal.ts를 저장소 → 스냅샷 순으로 찾아 읽는다. 둘 다 없으면 예외.

    호출부(streamlit_app.py)는 예외를 잡아 기존 안내문을 그대로 보여 준다 —
    대조표만 접히고 편집 기능은 계속 쓸 수 있어야 한다.
    """
    base = Path(base_dir) if base_dir else _module_dir()
    tried = []

    for origin, relpath in LEGAL_SOURCE_RELPATHS:
        path = base / relpath
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            tried.append(relpath)
            continue

        meta = {}
        if origin == "snapshot":
            try:
                meta = parse_snapshot_meta(
                    (base / SNAPSHOT_DIR_NAME / SNAPSHOT_META_NAME).read_text(encoding="utf-8")
                )
            except OSError:
                meta = {}
        return LegalSource(origin=origin, path=path, text=text, meta=meta)

    raise FileNotFoundError(
        "legal.ts를 찾을 수 없습니다 (찾아본 곳: " + ", ".join(tried) + ")"
    )


def snapshot_notice(source) -> str | None:
    """스냅샷에서 읽었을 때 드리프트 표 위에 붙일 한 줄. 저장소면 None.

    시각이든 커밋이든 하나라도 있으면 밝힌다 — 둘 다 없으면 "언제 것인지 모르는
    사본"이라는 사실 자체를 알린다.
    """
    if not isinstance(source, LegalSource) or not source.is_snapshot:
        return None

    captured_at = source.meta.get(SNAPSHOT_CAPTURED_AT_KEY)
    commit = source.meta.get(SNAPSHOT_COMMIT_KEY)

    if not captured_at and not commit:
        return "스냅샷 기준: 시각·커밋 정보가 없습니다 (배포 스크립트를 거치지 않은 사본)"
    return f"스냅샷 기준: {captured_at or '시각 미상'} ({commit or '커밋 미상'})"


# 드리프트 표에 쓰는 사람이 읽는 이름
_FIELD_LABELS = {
    OFFICER_NAME_FIELD: "개인정보 보호책임자 성명",
    CONTACT_EMAIL_FIELD: "보호책임자 연락처",
    INQUIRY_EMAIL_FIELD: "1:1 문의 주소",
    VERSION_FIELD: "법무 문서 버전",
}

STATUS_UNSET = "DB 미설정 — 코드 값이 표시됩니다"
STATUS_SAME = "DB 설정됨 — 코드와 같음"
STATUS_DIFFERENT = "DB 설정됨 — 코드와 다름 (DB가 우선)"


def compare_legal_drift(code_defaults, doc_data) -> pd.DataFrame:
    """코드 기본값(legal.ts)과 DB값을 나란히 놓은 대조표.

    왜 필요한가 — DB에 값이 없으면 앱은 **조용히** 코드 값을 쓴다. 화면상
    구분이 되지 않으므로(scenarios 폴백에서 이미 겪은 혼란이다), "바꿨는데
    반영이 안 된다"를 여기서 눈으로 확인할 수 있어야 한다.

    혼합 타입 DataFrame이 Arrow 직렬화에서 프로세스를 죽인 전례가 있어
    전 칸을 문자열로 만든다.
    """
    code_defaults = code_defaults or {}
    doc_data = doc_data if isinstance(doc_data, dict) else {}
    rows = []

    for field, label in _FIELD_LABELS.items():
        code_value = code_defaults.get(field)
        db_value = doc_data.get(field)
        db_value = db_value.strip() if isinstance(db_value, str) else None

        if not db_value:
            status = STATUS_UNSET
        elif db_value == code_value:
            status = STATUS_SAME
        else:
            status = STATUS_DIFFERENT

        rows.append(
            {
                "항목": label,
                "코드 기본값 (legal.ts)": str(code_value or "(찾지 못함)"),
                "DB 값 (settings/legal)": str(db_value or "(없음)"),
                "상태": status,
            }
        )

    for field, label, headings_key in (
        (TERMS_SECTIONS_FIELD, "이용약관 조항 수", "termsHeadings"),
        (PRIVACY_SECTIONS_FIELD, "처리방침 조항 수", "privacyHeadings"),
        (MARKETING_SECTIONS_FIELD, "마케팅 동의 조항 수", "marketingHeadings"),
    ):
        code_count = len(code_defaults.get(headings_key) or [])
        db_sections = normalize_sections(doc_data.get(field))

        if db_sections is None:
            status = STATUS_UNSET
            db_text = "(없음)"
        else:
            db_text = f"{len(db_sections)}개"
            status = STATUS_SAME if len(db_sections) == code_count else STATUS_DIFFERENT

        rows.append(
            {
                "항목": label,
                "코드 기본값 (legal.ts)": f"{code_count}개" if code_count else "(찾지 못함)",
                "DB 값 (settings/legal)": db_text,
                "상태": status,
            }
        )

    # 표시 스위치는 불리언이라 위 두 묶음과 판정이 다르다 — **false도 설정된
    # 값**이므로 빈 문자열과 같이 "미설정"으로 접으면 꺼 둔 상태가 표에서
    # 사라진다(끄고도 켜져 있다고 읽게 된다).
    code_enabled = code_defaults.get(MARKETING_CONSENT_ENABLED_FIELD)
    db_enabled = doc_data.get(MARKETING_CONSENT_ENABLED_FIELD)

    if not isinstance(db_enabled, bool):
        enabled_status = STATUS_UNSET
    elif db_enabled == code_enabled:
        enabled_status = STATUS_SAME
    else:
        enabled_status = STATUS_DIFFERENT

    rows.append(
        {
            "항목": "마케팅 동의 항목 표시",
            "코드 기본값 (legal.ts)": _enabled_text(code_enabled),
            "DB 값 (settings/legal)": _enabled_text(db_enabled),
            "상태": enabled_status,
        }
    )

    return pd.DataFrame(rows)


def _enabled_text(value) -> str:
    """표시 스위치를 표에 쓸 한 낱말로. 불리언이 아니면 '없음'으로 본다."""
    if not isinstance(value, bool):
        return "(없음)"
    return "표시함" if value else "숨김"


# ── 저장 / 되돌리기 ───────────────────────────────────────────────

def snapshot_legal(doc_data):
    """문서에서 관리 대상 필드만 뽑은 사본. 되돌릴 지점으로 보관한다."""
    if not isinstance(doc_data, dict):
        return {}
    return {field: doc_data[field] for field in MANAGED_LEGAL_FIELDS if field in doc_data}


def build_legal_payload(values, current_data=None, current_updated_at=None) -> dict:
    """저장 시 Firestore에 merge할 payload를 만든다.

    기존 값을 previousLegal로 밀어 넣어 되돌릴 지점을 남긴다.
    **내용이 같으면 보관을 갱신하지 않는다** — 같은 값을 실수로 다시 저장했을 때
    previousLegal까지 같은 내용으로 덮이면 되돌릴 곳이 사라지기 때문이다
    (export_utils.build_upload_payload와 같은 규칙).
    """
    payload = {field: values[field] for field in MANAGED_LEGAL_FIELDS if field in (values or {})}
    previous = snapshot_legal(current_data)

    if previous and previous != {f: payload.get(f) for f in previous}:
        payload[PREVIOUS_LEGAL_FIELD] = previous
        payload[PREVIOUS_UPDATED_AT_FIELD] = current_updated_at or now_iso()

    payload[UPDATED_AT_FIELD] = now_iso()
    return payload


def can_rollback_legal(doc_data) -> bool:
    """되돌릴 이전 버전이 실제로 보관돼 있는가."""
    if not isinstance(doc_data, dict):
        return False
    return bool(doc_data.get(PREVIOUS_LEGAL_FIELD))


def build_legal_rollback_payload(current_data, previous_data, current_updated_at=None) -> dict:
    """되돌리기 = 현재↔이전 **스왑**. 두 번 누르면 원상복구된다.

    이전 스냅샷에 없던 필드는 명시적으로 None으로 지운다. 쓰기가 merge라서
    빼 두면 지금 값이 그대로 남는데, 그러면 "되돌렸다"고 말하고 일부만 되돌린
    상태가 된다. None으로 지우면 앱은 그 필드를 '없음'으로 보고 코드 기본값으로
    폴백한다 — 값을 설정하기 전 상태로 정확히 돌아간다.
    """
    previous_data = previous_data if isinstance(previous_data, dict) else {}
    payload = {field: previous_data.get(field) for field in MANAGED_LEGAL_FIELDS}
    payload[PREVIOUS_LEGAL_FIELD] = snapshot_legal(current_data)
    payload[PREVIOUS_UPDATED_AT_FIELD] = current_updated_at or now_iso()
    payload[UPDATED_AT_FIELD] = now_iso()
    return payload


def summarize_legal(doc_data) -> dict:
    """문서 한 벌의 크기 요약. 되돌리기 전에 두 버전을 눈으로 대조하는 용도."""
    doc_data = doc_data if isinstance(doc_data, dict) else {}
    terms = normalize_sections(doc_data.get(TERMS_SECTIONS_FIELD)) or []
    privacy = normalize_sections(doc_data.get(PRIVACY_SECTIONS_FIELD)) or []
    marketing = normalize_sections(doc_data.get(MARKETING_SECTIONS_FIELD)) or []
    return {
        "terms": len(terms),
        "privacy": len(privacy),
        "marketing": len(marketing),
        # 표시 스위치는 되돌리기·이력의 대조 대상이다 — 문안은 그대로인데
        # 스위치만 바뀐 저장이 있을 수 있고, 그것도 게시되는 동의 절차의 변경이다.
        "marketingEnabled": _enabled_text(doc_data.get(MARKETING_CONSENT_ENABLED_FIELD)),
        "officerName": str(doc_data.get(OFFICER_NAME_FIELD) or ""),
        "version": str(doc_data.get(VERSION_FIELD) or ""),
    }


def compare_legal_versions(current_data, previous_data, previous_updated_at=None) -> pd.DataFrame:
    """현재/이전 두 버전의 비교표. st.dataframe에 그대로 넘긴다."""
    current = summarize_legal(current_data)
    previous = summarize_legal(previous_data)
    return pd.DataFrame(
        [
            {
                "구분": "현재 버전",
                "약관 조항": f"{current['terms']}개" if current["terms"] else "(미설정)",
                "처리방침 조항": f"{current['privacy']}개" if current["privacy"] else "(미설정)",
                "마케팅 조항": f"{current['marketing']}개" if current["marketing"] else "(미설정)",
                "마케팅 표시": current["marketingEnabled"],
                "보호책임자": current["officerName"] or "(미설정)",
                "문서 버전": current["version"] or "(미설정)",
                "저장 시각": "",
            },
            {
                "구분": "이전 버전 (되돌릴 대상)",
                "약관 조항": f"{previous['terms']}개" if previous["terms"] else "(미설정)",
                "처리방침 조항": f"{previous['privacy']}개" if previous["privacy"] else "(미설정)",
                "마케팅 조항": f"{previous['marketing']}개" if previous["marketing"] else "(미설정)",
                "마케팅 표시": previous["marketingEnabled"],
                "보호책임자": previous["officerName"] or "(미설정)",
                "문서 버전": previous["version"] or "(미설정)",
                "저장 시각": format_timestamp(previous_updated_at),
            },
        ]
    )


# ── 저장 이력 (settings_history) ──────────────────────────────────
#
# 되돌리기는 **1단계**뿐이다 (previousLegal 하나). 그래서 "지금 것"과 "직전
# 것"은 알 수 있어도 "3월에는 어떤 문안이 게시돼 있었나"는 알 수 없다. 약관은
# 동의 증빙 대상이라 그 질문이 언젠가 온다 — 이용자가 동의한 시점의 문안을
# 제시하지 못하면 동의 기록의 version 값만 남고 내용은 사라진다.
#
# 그래서 legal 저장이 성공할 때마다 payload 전체를 별도 컬렉션에 append한다.
# 되돌리기와 달리 **덮어쓰지 않는다** — 문서 id가 저장 시각이라 서로 충돌하지
# 않고 계속 쌓인다.
#
# 공지(notice)는 제외한다. 배너 문구는 증빙 대상이 아니고 자주 바뀌어서,
# 함께 쌓으면 정작 찾아야 할 약관 이력이 소음에 묻힌다.
#
# firestore.rules는 건드리지 않는다 — 프론트엔드는 이 컬렉션을 읽지 않고,
# 어드민이 쓰는 Admin SDK는 보안 규칙을 우회하므로 규칙을 더해도 아무 효과가 없다.
SETTINGS_HISTORY_COLLECTION = "settings_history"
SAVED_AT_FIELD = "savedAt"

#: 이력 표에 보여 줄 최대 건수. 증빙 조회는 최근 것부터 훑는 일이라 전량을
#: 끌어올 이유가 없다(문서가 늘수록 읽기 비용도 는다).
HISTORY_LIMIT = 20


def build_history_payload(payload, saved_at=None) -> dict:
    """저장 payload 전체를 그대로 담은 이력 문서.

    가공하지 않는 것이 요점이다 — 요약만 남기면 정작 "그때 그 조항 본문이
    무엇이었나"를 답할 수 없어 증빙 가치가 사라진다.

    savedAt은 payload의 updatedAt과 **같은 값**으로 맞춘다. 둘이 몇 밀리초라도
    어긋나면 나중에 settings/legal의 갱신 시각으로 이력을 찾을 때 매칭에 실패한다.
    """
    payload = payload if isinstance(payload, dict) else {}
    stamp = saved_at or payload.get(UPDATED_AT_FIELD) or now_iso()
    return {**payload, SAVED_AT_FIELD: stamp}


def history_doc_id(payload) -> str:
    """이력 문서의 id = 저장 시각(ISO). 시각순 정렬이 곧 id순 정렬이 된다."""
    payload = payload if isinstance(payload, dict) else {}
    return str(payload.get(SAVED_AT_FIELD) or payload.get(UPDATED_AT_FIELD) or now_iso())


def sort_history(entries):
    """최신 저장이 위로. savedAt이 없는 문서는 맨 아래로 민다."""
    return sorted(
        [e for e in (entries or []) if isinstance(e, dict)],
        key=lambda e: str(e.get(SAVED_AT_FIELD) or ""),
        reverse=True,
    )


def build_history_rows(entries, limit=HISTORY_LIMIT) -> pd.DataFrame:
    """이력 표. 읽기 전용이며 되돌리기 대상이 아니다.

    조항 '수'만 보여 주는 이유는 compare_legal_versions와 같다 — 전문을 표에
    펼치면 한 행이 화면을 덮어 훑어보는 용도로 못 쓴다. 본문은 아래 상세에서 본다.
    """
    rows = []
    for entry in sort_history(entries)[:limit]:
        summary = summarize_legal(entry)
        rows.append(
            {
                "저장 시각": format_timestamp(entry.get(SAVED_AT_FIELD)),
                "문서 버전": summary["version"] or "(미설정)",
                "약관 조항": f"{summary['terms']}개" if summary["terms"] else "(미설정)",
                "처리방침 조항": f"{summary['privacy']}개" if summary["privacy"] else "(미설정)",
                "마케팅 조항": f"{summary['marketing']}개" if summary["marketing"] else "(미설정)",
                "마케팅 표시": summary["marketingEnabled"],
                "보호책임자": summary["officerName"] or "(미설정)",
            }
        )

    if not rows:
        return pd.DataFrame(
            columns=[
                "저장 시각",
                "문서 버전",
                "약관 조항",
                "처리방침 조항",
                "마케팅 조항",
                "마케팅 표시",
                "보호책임자",
            ]
        )
    return pd.DataFrame(rows)


def history_entry_labels(entries) -> list:
    """상세 선택 드롭다운에 쓸 라벨 목록. 표의 행 순서와 같다."""
    return [
        f"{format_timestamp(entry.get(SAVED_AT_FIELD))} · {summarize_legal(entry)['version'] or '버전 미설정'}"
        for entry in sort_history(entries)[:HISTORY_LIMIT]
    ]


def history_section_titles(entry) -> pd.DataFrame:
    """선택한 이력 한 건의 조항 제목 목록. 그때 무엇이 실려 있었는지 확인용이다."""
    entry = entry if isinstance(entry, dict) else {}
    rows = []
    for field_name, label in (
        (TERMS_SECTIONS_FIELD, "이용약관"),
        (PRIVACY_SECTIONS_FIELD, "개인정보 처리방침"),
        (MARKETING_SECTIONS_FIELD, "마케팅 정보 수신 동의"),
    ):
        sections = normalize_sections(entry.get(field_name)) or []
        for index, item in enumerate(sections, start=1):
            rows.append({"문서": label, "순서": str(index), "조항 제목": item["heading"]})

    if not rows:
        return pd.DataFrame(columns=["문서", "순서", "조항 제목"])
    return pd.DataFrame(rows)


# ── 공지 ──────────────────────────────────────────────────────────

def build_notice_payload(active, message) -> dict:
    """공지 저장 payload. active는 반드시 불리언으로 굳혀서 쓴다.

    앱은 `active === true`일 때만 배너를 띄운다 — 문자열 "true"나 1이 들어가면
    켠 줄 알았는데 안 뜨는(또는 그 반대의) 상태가 된다. 저장 시점에 타입을
    확정해 그 여지를 없앤다.
    """
    return {
        NOTICE_ACTIVE_FIELD: bool(active),
        NOTICE_MESSAGE_FIELD: str(message or "").strip(),
        UPDATED_AT_FIELD: now_iso(),
    }


def resolve_notice(doc_data) -> dict:
    """앱이 실제로 배너를 띄울지 판정한다 (useSettingsStore.resolveNotice와 미러).

    켜져 있어도 본문이 비면 뜨지 않는다 — 어드민이 "켰는데 왜 안 뜨죠?"를
    묻기 전에 화면에서 알려 주기 위해 앱과 같은 판정을 여기서도 한다.
    """
    doc_data = doc_data if isinstance(doc_data, dict) else {}
    message = str(doc_data.get(NOTICE_MESSAGE_FIELD) or "").strip()
    return {
        "active": doc_data.get(NOTICE_ACTIVE_FIELD) is True and message != "",
        "message": message,
    }


def notice_status_label(doc_data) -> str:
    """공지 상태를 한 줄로. 화면 상단 배지에 쓴다."""
    doc_data = doc_data if isinstance(doc_data, dict) else {}
    resolved = resolve_notice(doc_data)

    if resolved["active"]:
        return "게시 중 — 앱 상단에 배너가 표시됩니다"
    if doc_data.get(NOTICE_ACTIVE_FIELD) is True:
        return "게시 안 됨 — 공지를 켰지만 본문이 비어 있습니다"
    return "게시 안 됨 — 공지가 꺼져 있습니다"
