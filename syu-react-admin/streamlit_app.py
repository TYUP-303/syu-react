import os
from io import StringIO
from pathlib import Path

import pandas as pd
import streamlit as st
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
from csv_validation import (
    JOIN_KEY_COLS,
    build_join_keys,
    validate_angels_df,
    validate_epilogue_df,
    validate_scenario_df,
    validate_questions_df,
)
from export_utils import (
    CSV_TEXT_FIELD,
    PREVIOUS_CSV_TEXT_FIELD,
    PREVIOUS_UPDATED_AT_FIELD,
    STRESS_RESULT_TYPE_LABEL,
    build_export_dataframe,
    build_rollback_payload,
    build_upload_payload,
    can_rollback,
    compare_versions,
    export_columns,
    export_filename,
    format_timestamp,
    now_iso,
    to_csv_bytes,
)
from user_admin_utils import (
    TEST_FIELDS,
    THEME_IDS,
    THEME_LABEL,
    account_block_reason,
    apply_plan_to_snapshot,
    build_answer_rows,
    build_consent_rows,
    build_deletion_payload,
    build_episode_rows,
    build_profile_rows,
    build_test_summary_rows,
    build_theme_progress_rows,
    demo_user_document,
    describe_plan,
    has_consent,
    epilogue_labels,
    has_epilogues_field,
    has_seen_reports_field,
    plan_episode_delete,
    plan_test_delete,
    plan_theme_reset,
    seen_report_labels,
)
from marketing_utils import (
    build_recipient_dataframe,
    demo_marketing_users,
    emails_to_line,
    extracted_at_label,
    recipient_emails,
    recipient_filename,
    summarize_recipients,
)
from settings_utils import (
    CONTACT_EMAIL_FIELD,
    INQUIRY_EMAIL_FIELD,
    LEGAL_DOC_ID,
    MARKETING_CONSENT_ENABLED_FIELD,
    MARKETING_SECTIONS_FIELD,
    NOTICE_ACTIVE_FIELD,
    NOTICE_DOC_ID,
    NOTICE_MESSAGE_FIELD,
    OFFICER_NAME_FIELD,
    PREVIOUS_LEGAL_FIELD,
    PRIVACY_SECTIONS_FIELD,
    SAVED_AT_FIELD,
    SECTION_BODY_COLUMN,
    SECTION_HEADING_COLUMN,
    SETTINGS_COLLECTION,
    SETTINGS_HISTORY_COLLECTION,
    TERMS_SECTIONS_FIELD,
    VERSION_FIELD,
    HISTORY_LIMIT,
    build_history_payload,
    build_history_rows,
    build_legal_payload,
    build_legal_rollback_payload,
    build_notice_payload,
    can_rollback_legal,
    compare_legal_drift,
    compare_legal_versions,
    history_doc_id,
    history_entry_labels,
    history_section_titles,
    load_legal_source,
    marketing_status_label,
    normalize_sections,
    notice_status_label,
    parse_legal_defaults,
    preview_privacy_sections,
    resolve_marketing_enabled,
    records_to_sections,
    sections_to_records,
    sections_to_text,
    snapshot_notice,
    sort_history,
    validate_sections,
)

#: 유저 상세 정정의 Mock 시뮬레이션 저장소. MOCK_DOCS_KEY와 같은 방침으로,
#: 자격증명 없이도 정정 절차를 끝까지 밟아 볼 수 있게 한다.
MOCK_USER_DOCS_KEY = "mock_user_docs"

#: 마케팅 동의자 이메일 추출 결과를 화면에 띄워 둘지. 'export_ready'와 같은
#: 방식으로, 메뉴를 다시 그려도 뽑아 둔 목록이 사라지지 않게 한다.
MARKETING_RECIPIENTS_READY = "marketing_recipients_ready"

load_dotenv('.env.local')

# 저장소 CSV 자산의 위치. __file__ 기준이라 어느 디렉터리에서 실행해도 같은 곳을
# 가리킨다 (check_csv_sync.py와 같은 방식). 어드민 디렉터리만 복사하는 Docker
# 컨테이너에는 이 경로가 없으므로 Seed 기능은 그 환경에서 실패한다 — 의도된 한계다.
DATA_DIR = Path(__file__).parent / "../syu-react-frontend/src/assets/data"

# 페이지 기본 설정
st.set_page_config(page_title="SYU-REACT Admin", page_icon="🦖", layout="wide")
def check_password():
    def password_entered():
        # ADMIN_PASSWORD 가 없으면 어떤 입력도 통과시키지 않는다 (fail-closed).
        # 예전엔 기본값 "admin" 으로 열려 있었다 — 공개 저장소에서는 위험하다.
        expected = os.getenv("ADMIN_PASSWORD")
        if expected and st.session_state["password"] == expected:
            st.session_state["password_correct"] = True
            del st.session_state["password"]
        else:
            st.session_state["password_correct"] = False

    if "password_correct" not in st.session_state:
        st.title("🔒 관리자 로그인")
        st.text_input("어드민 비밀번호를 입력하세요", type="password", on_change=password_entered, key="password")
        return False
    elif not st.session_state["password_correct"]:
        st.title("🔒 관리자 로그인")
        st.text_input("어드민 비밀번호를 입력하세요", type="password", on_change=password_entered, key="password")
        st.error("😕 비밀번호가 일치하지 않습니다.")
        return False
    else:
        return True

if not check_password():
    st.stop()

# Firebase 초기화 함수
@st.cache_resource
def init_firebase():
    if not firebase_admin._apps:
        # 서비스 계정 키를 환경 변수 또는 로컬 파일에서 로드
        # 주의: 실제 프로덕션 환경에서는 Streamlit Secrets 또는 GCP Secret Manager를 사용해야 합니다.
        # 여기서는 로컬 개발을 위해 기본 인증 또는 더미 설정을 사용합니다.
        try:
            # secrets 파일이 존재하는지 검사 (Streamlit은 파일이 없으면 예외를 던집니다)
            #
            # ADMIN_FORCE_MOCK=1이면 secrets가 있어도 무시하고 Mock으로 간다.
            # 테스트가 쓰는 스위치다 — 개발 머신에는 실 secrets.toml이 있어서,
            # 이 스위치가 없으면 "Mock 모드" 스모크 테스트가 실 Firestore에
            # 연결된 채 돌게 된다 (2026-08-13 머지 검증에서 실제로 발생.
            # 쓰기 전 단언에서 실패해 실 DB 피해는 없었음).
            has_secrets = False
            if os.getenv("ADMIN_FORCE_MOCK") != "1":
                try:
                    if "firebase" in st.secrets:
                        has_secrets = True
                except FileNotFoundError:
                    pass
            
            if has_secrets:
                cert = dict(st.secrets["firebase"])
                cred = credentials.Certificate(cert)
                firebase_admin.initialize_app(cred)
                st.success("Firebase 연결 성공!")
            else:
                st.warning("Firebase 인증 정보(secrets.toml)가 없습니다. Mock 모드로 실행합니다.")
        except Exception as e:
            st.error(f"Firebase 연결 실패 (에러: {e})")
            st.warning("Mock 모드로 실행합니다.")
            
    return None

init_firebase()


# ─── CSV 문서 저장소 (실 Firestore / Mock 세션) ───────────────────
# Firebase가 없어도 CSV 관리 화면이 동작해야 한다. 예전에는 두 메뉴가 통째로
# st.error로 막혀 있어서, 인수인계 대상인 팀이 자격증명 없이는 업로드·되돌리기
# 절차를 한 번도 연습해 볼 수 없었다. Mock 모드에서는 세션 상태를 문서 저장소로
# 흉내 내고, 브라우저 세션이 끝나면 함께 사라진다.
MOCK_DOCS_KEY = "mock_csv_docs"


def is_mock_mode():
    return not firebase_admin._apps


def _mock_docs():
    if MOCK_DOCS_KEY not in st.session_state:
        st.session_state[MOCK_DOCS_KEY] = {}
    return st.session_state[MOCK_DOCS_KEY]


def doc_get(collection, doc_id):
    """문서 전체(dict)와 마지막 갱신 시각(ISO 문자열)을 돌려준다. 없으면 (None, None)."""
    if is_mock_mode():
        entry = _mock_docs().get(f"{collection}/{doc_id}")
        return (entry["data"], entry["updatedAt"]) if entry else (None, None)

    snap = firestore.client().collection(collection).document(doc_id).get()
    if not snap.exists:
        return None, None
    updated_at = None
    try:
        updated_at = snap.update_time.isoformat() if snap.update_time else None
    except (AttributeError, ValueError):
        pass
    return snap.to_dict(), updated_at


def doc_set(collection, doc_id, payload):
    """**항상 merge**로 쓴다 — 덮어쓰기로 저장하면 previousCsvText 보관이 날아간다."""
    if is_mock_mode():
        docs = _mock_docs()
        key = f"{collection}/{doc_id}"
        entry = docs.get(key) or {"data": {}, "updatedAt": None}
        entry["data"] = {**entry["data"], **payload}
        entry["updatedAt"] = now_iso()
        docs[key] = entry
        return

    firestore.client().collection(collection).document(doc_id).set(payload, merge=True)


@st.cache_data(ttl=60)
def fetch_users_raw():
    """users 컬렉션 원문을 (uid, 문서 dict) 목록으로. 연구용 내보내기 전용이다.

    fetch_users_data()는 화면 표에 맞춘 6개 열만 남기고 scenarios·counts를 버리기
    때문에 내보내기에 쓸 수 없다. Auth 조회도 하지 않는다 — 이메일은 users 문서에
    이미 있고, 내보내기는 계정 상태(정지 여부)를 다루지 않는다.
    """
    if is_mock_mode():
        return []
    try:
        db = firestore.client()
        return [(doc.id, doc.to_dict() or {}) for doc in db.collection('users').stream()]
    except Exception as e:
        st.error(f"유저 데이터 조회 오류: {e}")
        return []


@st.cache_data(ttl=60)
def fetch_users_data():
    if not firebase_admin._apps:
        return pd.DataFrame(), 0, 0, 0
        
    try:
        from firebase_admin import auth
        db = firestore.client()
        
        # 1. Fetch Auth Users
        auth_users = {}
        for user_record in auth.list_users().iterate_all():
            auth_users[user_record.uid] = {
                "email": user_record.email,
                "disabled": user_record.disabled
            }
            
        # 2. Fetch Firestore Users
        users_ref = db.collection('users')
        docs = users_ref.stream()
        
        firestore_users = {}
        adhd_count = 0
        stress_count = 0
        
        for doc in docs:
            data = doc.to_dict()
            uid = doc.id
            
            created_at = data.get('createdAt')
            created_at_str = ""
            if created_at:
                try:
                    created_at_str = created_at.strftime('%Y-%m-%d %H:%M:%S')
                except Exception:
                    pass
                    
            adhd_result = data.get('adhdResult')
            stress_result = data.get('stressResult')
            
            adhd_score = adhd_result.get('score') if isinstance(adhd_result, dict) else None
            stress_score = stress_result.get('score') if isinstance(stress_result, dict) else None
            stress_result_type = stress_result.get('resultType') if isinstance(stress_result, dict) else None
            
            stress_type_label = STRESS_RESULT_TYPE_LABEL.get(stress_result_type, "-") if stress_result_type else "-"
            
            if adhd_score is not None:
                adhd_count += 1
            if stress_score is not None:
                stress_count += 1
                
            firestore_users[uid] = {
                "가입일": created_at_str,
                "ADHD 점수": adhd_score,
                "스트레스 유형": stress_type_label
            }
            
        # 3. Join
        all_uids = set(auth_users.keys()).union(set(firestore_users.keys()))
        users_list = []
        for uid in all_uids:
            a_data = auth_users.get(uid, {})
            f_data = firestore_users.get(uid, {})
            
            email = a_data.get('email', 'Auth 없음(Firestore)')
            status = "정지됨" if a_data.get('disabled') else "활성"
            if not a_data:
                status = "Auth 없음"
                
            users_list.append({
                "uid": uid,
                "email": email,
                "상태": status,
                "가입일": f_data.get('가입일', ''),
                "ADHD 점수": f_data.get('ADHD 점수', None),
                "스트레스 유형": f_data.get('스트레스 유형', '-')
            })
            
        return pd.DataFrame(users_list), len(users_list), adhd_count, stress_count
    except Exception as e:
        st.error(f"데이터 패칭 오류: {e}")
        return pd.DataFrame(), 0, 0, 0

@st.dialog("경고: 계정 정지")
def confirm_disable_dialog(uid, email):
    # 마지막 그물. 버튼을 이미 비활성으로 막았지만, 다이얼로그가 열린 상태에서
    # 선택이 바뀌는 경로가 있어 실행 직전에 한 번 더 본다
    # (seed_uat_accounts가 삭제 직전에 두는 단언과 같은 이유).
    blocked = account_block_reason(email)
    if blocked:
        st.error(blocked)
        return

    st.warning(f"정말로 '{email}' 유저의 접속을 차단하시겠습니까?\n해당 유저는 더 이상 로그인할 수 없게 됩니다.")
    if st.button("네, 정지합니다", type="primary"):
        from firebase_admin import auth
        auth.update_user(uid, disabled=True)
        st.success("계정이 정지되었습니다.")
        fetch_users_data.clear()
        st.rerun()

@st.dialog("경고: 계정 영구 삭제")
def confirm_delete_dialog(uid, email):
    blocked = account_block_reason(email)
    if blocked:
        st.error(blocked)
        return

    st.error(f"정말로 '{email}' 유저를 삭제하시겠습니까?\n이 작업은 절대 되돌릴 수 없으며, 기존의 모든 검사 결과 데이터도 함께 영구 삭제됩니다!")
    if st.button("네, 영구 삭제합니다", type="primary"):
        from firebase_admin import auth
        try:
            auth.delete_user(uid)
            db = firestore.client()
            db.collection('users').document(uid).delete()
            st.success("유저 삭제가 완료되었습니다.")
            fetch_users_data.clear()
            st.rerun()
        except Exception as e:
            st.error(f"삭제 오류: {e}")

# ─── 시나리오 CSV 스펙 ────────────────────────────────
# 프론트엔드 파서(src/utils/scenarioCsvParser.ts)가 요구하는 최소 조건입니다.
# 이 조건을 어기면 앱은 예외를 던지지 않고 해당 행을 조용히 버리므로,
# 업로드 전에 여기서 미리 걸러냅니다.
#
# filename은 **저장소 자산의 실제 파일명**이다 — 내려받은 파일을
# syu-react-frontend/src/assets/data/ 에 그대로 덮어쓰면 되도록 맞춰 둔 것이며,
# check_csv_sync.py의 TARGETS와 같은 대응이다.
SCENARIO_SPECS = {
    "비주얼 (배경/캐릭터)": {
        "doc_id": "visual",
        "filename": "scenario_visual.csv",
        "min_cols": 20,
        "spec_hint": "메타 4열(NO, DOMAIN, REACTION_TYPE, TITLE) + 4씬 × (배경, 캐릭터1~3) = 최소 20열",
    },
    "대사": {
        "doc_id": "dialogue",
        "filename": "scenario_dialogues.csv",
        "min_cols": 6,
        "spec_hint": "NO, DOMAIN, REACTION_TYPE, SCENE_NUM, SCENE_TYPE, TEXT = 최소 6열",
    },
    # 요정 조언은 반응 기제 버전과 무관한 에피소드 단위 원고라 조인 키가 DOMAIN
    # 하나뿐이다 (scenarioAngelsCsvParser.ts). 열 개수가 아니라 헤더 이름으로
    # 읽으므로 min_cols가 없고, 검증도 validate_angels_df가 따로 맡는다.
    "요정 조언·선택지": {
        "doc_id": "angels",
        "filename": "scenario_angels.csv",
        "spec_hint": "NO, DOMAIN + 요정 3종 × (TITLE, DETAIL, AFTER) + HELPFUL_1~3 / UNHELPFUL_1~3",
    },
    # 에필로그는 영역당 한 편이라 DOMAIN에 회차 번호가 붙지 않고('직장1'이 아니라
    # '직장'), 씬 하나가 한 행이다. 씬 수는 영역마다 다르다(4~6 — 매듭 장면의
    # 길이가 영역마다 달라서다). 요정 조언과 마찬가지로 헤더 이름으로 읽으므로
    # min_cols가 없고, 검증은 validate_epilogue_df가 따로 맡는다.
    "에필로그": {
        "doc_id": "epilogue",
        "filename": "scenario_epilogue.csv",
        "spec_hint": "DOMAIN, SCENE_NUM, TITLE, BG, CHAR_1, CHAR_2, CHAR_3, TEXT (4영역 × 4~6씬 = 16~24행)",
    },
}

QUESTION_SPECS = {
    "ADHD 검사": {"doc_id": "adhd", "filename": "adhd_questions.csv"},
    "스트레스 대처 기제 검사": {"doc_id": "stress", "filename": "stress_questions.csv"},
}


# ─── CSV 관리 공용 UI ────────────────────────────────────────────

def render_repo_sync_notice(filename):
    """업로드 화면마다 붙는 역방향 드리프트 경고.

    콘텐츠는 저장소 CSV와 Firestore csvText 두 곳에 산다. 프로덕션은 Firestore가
    우선이라, 어드민에서 업로드만 하고 저장소를 그대로 두면 **깃허브 쪽이 조용히
    구형이 된다.** 대조는 check_csv_sync.py가 해 준다.
    """
    st.info(
        f"업로드 후 저장소(`src/assets/data/{filename}`)에도 같은 파일을 반영하세요. "
        "반영하지 않으면 깃허브 쪽이 구형이 되어, 나중에 저장소 CSV를 기준으로 다시 "
        "시드하거나 되돌릴 때 변경분이 사라집니다. 두 곳이 맞는지는 "
        "`check_csv_sync.py`로 대조할 수 있습니다."
    )


def render_csv_download(csv_text, filename, key):
    """현재 DB의 csvText를 저장소 자산과 같은 파일명으로 내려받는다.

    ⚠️ BOM을 붙이지 않는다. 이 파일의 목적지는 엑셀이 아니라 저장소이고,
    프론트 파서는 헤더 이름으로 열을 찾기 때문에 BOM이 붙으면 첫 열 이름이
    '﻿NO'가 되어 조용히 매칭에 실패한다. (연구용 내보내기는 반대로 BOM을 붙인다.)
    """
    st.download_button(
        "현재 DB CSV 내려받기",
        data=(csv_text or "").encode("utf-8"),
        file_name=filename,
        mime="text/csv",
        key=key,
        help="내려받은 파일을 저장소의 같은 이름 파일에 덮어쓰고 커밋하면 양쪽이 맞습니다.",
    )


def rollback_flag_key(collection, doc_id):
    return f"rollback_open_{collection}_{doc_id}"


@st.dialog("확인: 이전 버전으로 되돌리기")
def confirm_rollback_dialog(collection, doc_id, current_csv, previous_csv, previous_updated_at, label):
    st.warning(
        f"**{label}**({collection}/{doc_id})을(를) 이전 버전으로 되돌립니다. "
        "현재 버전은 버려지지 않고 '이전 버전' 자리로 들어가므로, 되돌리기를 한 번 더 "
        "누르면 지금 상태로 복구됩니다."
    )
    st.dataframe(
        compare_versions(current_csv, previous_csv, previous_updated_at),
        use_container_width=True,
        hide_index=True,
    )
    col_yes, col_no = st.columns(2)
    with col_yes:
        if st.button("네, 되돌립니다", type="primary", key=f"rollback_confirm_{collection}_{doc_id}"):
            doc_set(collection, doc_id, build_rollback_payload(current_csv, previous_csv))
            st.session_state[rollback_flag_key(collection, doc_id)] = False
            st.success("이전 버전으로 되돌렸습니다. 앱을 새로고침하면 적용됩니다.")
            st.rerun()
    with col_no:
        if st.button("취소하기", key=f"rollback_cancel_{collection}_{doc_id}"):
            st.session_state[rollback_flag_key(collection, doc_id)] = False
            st.rerun()


def render_rollback_section(collection, doc_id, doc_data, current_csv, label):
    """업로드 직전 버전으로 되돌리는 구역. 보관본이 없으면 안내만 남긴다."""
    st.subheader("이전 버전으로 되돌리기")

    if not can_rollback(doc_data):
        st.caption(
            "보관된 이전 버전이 없습니다. 이 화면에서 CSV를 한 번 저장하면 "
            "그때의 내용이 자동으로 보관되어 되돌릴 수 있게 됩니다."
        )
        return

    previous_csv = doc_data.get(PREVIOUS_CSV_TEXT_FIELD, "")
    previous_updated_at = doc_data.get(PREVIOUS_UPDATED_AT_FIELD)

    st.dataframe(
        compare_versions(current_csv, previous_csv, previous_updated_at),
        use_container_width=True,
        hide_index=True,
    )
    col_a, col_b = st.columns(2)
    with col_a:
        # 열림 상태를 세션에 남긴다. 버튼 반환값은 한 번의 실행에서만 True이므로,
        # `if st.button(): dialog()` 형태로 열면 확인 버튼을 누르는 실행에서
        # 다이얼로그가 다시 그려지지 않는다(계정 정지·삭제 다이얼로그는 실제
        # 브라우저의 프래그먼트 재실행 덕에 동작하지만, 그 경로는 자동화
        # 테스트로 재현되지 않아 되돌리기가 실제로 되는지 확인할 수 없었다).
        if st.button("이전 버전으로 되돌리기", key=f"rollback_{collection}_{doc_id}"):
            st.session_state[rollback_flag_key(collection, doc_id)] = True
    with col_b:
        st.download_button(
            "이전 버전 내려받기",
            data=previous_csv.encode("utf-8"),
            file_name=f"previous_{doc_id}.csv",
            mime="text/csv",
            key=f"download_prev_{collection}_{doc_id}",
            help="되돌리지 않고 내용만 확인하고 싶을 때 씁니다.",
        )

    # 다이얼로그 호출은 열(column) 밖에 둔다 — 모달은 화면 전체를 덮으므로
    # 트리거 버튼의 레이아웃 안에 넣을 이유가 없다.
    if st.session_state.get(rollback_flag_key(collection, doc_id)):
        confirm_rollback_dialog(
            collection, doc_id, current_csv, previous_csv, previous_updated_at, label
        )


def save_csv_text(collection, doc_id, new_csv, current_csv, current_updated_at):
    """csvText를 저장하면서 직전 내용을 previousCsvText로 보관한다."""
    doc_set(collection, doc_id, build_upload_payload(new_csv, current_csv, current_updated_at))


# ─── 약관 저장 이력 (settings_history) ───────────────────────────
# doc_set과 달리 **덮어쓰지 않고 쌓는다**. 문서 id가 저장 시각이라 서로 부딪히지
# 않는다. 보안 규칙(firestore.rules)은 손대지 않았다 — 프론트엔드는 이 컬렉션을
# 읽지 않고, 어드민의 Admin SDK는 규칙을 우회하므로 규칙을 더해도 효과가 없다.
MOCK_HISTORY_KEY = "mock_settings_history"


def _mock_history():
    if MOCK_HISTORY_KEY not in st.session_state:
        st.session_state[MOCK_HISTORY_KEY] = []
    return st.session_state[MOCK_HISTORY_KEY]


def history_append(payload):
    """legal 저장 payload 한 벌을 이력으로 남긴다."""
    entry = build_history_payload(payload)
    if is_mock_mode():
        _mock_history().append(entry)
        return
    firestore.client().collection(SETTINGS_HISTORY_COLLECTION).document(
        history_doc_id(entry)
    ).set(entry)


def history_fetch():
    """최근 이력을 최신순으로. 읽기 전용이며 되돌리기 대상이 아니다."""
    if is_mock_mode():
        return sort_history(_mock_history())[:HISTORY_LIMIT]
    try:
        docs = (
            firestore.client()
            .collection(SETTINGS_HISTORY_COLLECTION)
            .order_by(SAVED_AT_FIELD, direction=firestore.Query.DESCENDING)
            .limit(HISTORY_LIMIT)
            .stream()
        )
        return [doc.to_dict() or {} for doc in docs]
    except Exception as e:
        st.error(f"저장 이력 조회 오류: {e}")
        return []


def save_legal(payload):
    """settings/legal 저장 + 이력 append를 한 동작으로 묶는다.

    호출부가 doc_set을 직접 부르면 이력을 빠뜨린 경로가 생긴다 — 저장 지점이
    네 곳(운영 정보·약관·처리방침·되돌리기)이라 실제로 빠뜨리기 쉽다.
    """
    doc_set(SETTINGS_COLLECTION, LEGAL_DOC_ID, payload)
    history_append(payload)


def render_mode_badge():
    """지금 실 DB를 보고 있는지 연습 중인지 **항상** 보이는 한 줄.

    init_firebase()의 '연결 성공/Mock' 메시지는 @st.cache_resource 안에 있어
    첫 실행에서 한 번만 뜨고, 메뉴를 옮기거나 스크롤하면 사라진다. 그러면
    운영팀은 Mock에서 원고를 올려 놓고 '반영 완료'라고 보고하게 된다
    (매뉴얼이 이 사고를 따로 경고할 만큼 실제로 잦다). 메뉴 옆에 상시로 둔다.
    """
    if is_mock_mode():
        st.warning("🟡 **Mock 모드** — 연습용. 저장해도 실제 DB에 남지 않습니다.")
    else:
        st.success("🟢 **실모드** — 저장하면 실제 서비스에 곧바로 반영됩니다.")


# 사이드바
with st.sidebar:
    st.title("🦖 SYU-REACT 관리자")
    render_mode_badge()
    menu = st.radio(
        "메뉴",
        ["대시보드 홈", "유저 관리", "검사 결과 분석", "문항 관리 (CSV)", "시나리오 관리 (CSV)", "약관·공지 관리"],
    )

# 대시보드 홈
if menu == "대시보드 홈":
    st.header("대시보드 홈")
    st.write("SYU-REACT 프로젝트 관리자 대시보드에 오신 것을 환영합니다.")
    
    df, total_users, total_adhd, total_stress = fetch_users_data()
    
    col1, col2, col3 = st.columns(3)
    col1.metric("총 가입 유저", f"{total_users} 명")
    col2.metric("ADHD 검사 완료", f"{total_adhd} 건")
    col3.metric("스트레스 검사 완료", f"{total_stress} 건")

# 유저 관리
elif menu == "유저 관리":
    st.header("유저 관리")
    st.write("가입한 유저 목록과 상세 정보를 조회 및 관리합니다.")
    
    df, _, _, _ = fetch_users_data()
    
    if df.empty:
        st.info("현재 가입된 유저가 없습니다.")
    else:
        # 표시용 문자열화 — 혼합 타입/NaN이 섞인 DataFrame을 st.dataframe이
        # Arrow로 직렬화할 때 Apple Silicon(py3.13 + pyarrow 25)에서
        # 세그폴트로 프로세스가 통째로 죽는다 (2026-08-06 재현).
        st.dataframe(df.fillna("-").astype(str), use_container_width=True)
        
        st.divider()
        st.subheader("유저 계정 제어 (Auth & DB)")
        
        selected_email = st.selectbox("관리할 유저 선택 (이메일)", df['email'].tolist())
        if selected_email:
            user_row = df[df['email'] == selected_email].iloc[0]
            uid = user_row['uid']
            status = user_row['상태']
            
            st.write(f"선택된 유저 UID: `{uid}` / 현재 상태: **{status}**")

            # 보호 계정 가드. 예전에는 코드 차원의 장치가 없어 '사람의 주의'만이
            # test@example.com을 지켜 주고 있었다 — 매뉴얼도 그렇게 적혀 있었다.
            # 판정은 user_admin_utils가 단독으로 가지고 있어(seed_uat_accounts와
            # 같은 목록), 진행도 정정 가드와 판별식을 공유한다.
            account_blocked = account_block_reason(selected_email)
            if account_blocked:
                st.warning(account_blocked)

            from firebase_admin import auth

            col1, col2, col3 = st.columns(3)

            with col1:
                if status == "활성":
                    if st.button(
                        "계정 정지 (Disable)",
                        disabled=bool(account_blocked),
                        help=account_blocked or None,
                    ):
                        confirm_disable_dialog(uid, selected_email)
                elif status == "정지됨":
                    # 활성화는 막지 않는다 — 보호 계정이 잘못 정지됐을 때
                    # 되살릴 수 있는 유일한 경로다.
                    if st.button("계정 활성화 (Enable)"):
                        auth.update_user(uid, disabled=False)
                        st.success(f"{selected_email} 계정이 다시 활성화되었습니다.")
                        fetch_users_data.clear()
                        st.rerun()

            with col2:
                # 이 버튼은 메일을 보내지 않는다. Firebase Admin SDK의
                # generate_password_reset_link()는 링크 문자열만 만들어 주고,
                # 발송은 별도 연동이 있어야 한다 — 예전 라벨('메일 발송')을 믿고
                # "메일 보냈습니다"라고 답신하면 상대는 아무것도 받지 못한다.
                if st.button("비밀번호 재설정 링크 만들기"):
                    try:
                        link = auth.generate_password_reset_link(selected_email)
                        st.success(
                            "재설정 링크를 만들었습니다. **메일은 나가지 않았습니다** — "
                            "아래 주소를 복사해 본인에게 직접 보내 주세요."
                        )
                        st.code(link, language=None)
                        st.warning(
                            "이 링크를 가진 사람은 누구나 그 계정의 비밀번호를 바꿀 수 있습니다. "
                            "본인 확인이 끝난 뒤 본인 메일 주소로만 보내고, 단체 채팅방·공개된 "
                            "곳에는 붙여 넣지 마세요."
                        )
                    except Exception as e:
                        st.error(f"재설정 링크 생성 오류: {e}")

            with col3:
                if st.button(
                    "계정 영구 삭제 (Delete)",
                    disabled=bool(account_blocked),
                    help=account_blocked or None,
                ):
                    confirm_delete_dialog(uid, selected_email)

    # ─── 유저 상세 조회 · 진행도 정정 (NRQ-0094 · 0095 · 0096) ────────
    # CS 인입(오류 등) 시 "어디까지 진행했는지"를 확인하고, 잘못 남은 기록만
    # 골라 지우는 창구다. 판단 로직은 전부 user_admin_utils에 있고 여기서는
    # 화면과 Firestore 쓰기만 맡는다.
    #
    # 쓰기는 예외 없이 3단계다: 변경 미리보기 → 체크박스 확인 → 실행 버튼.
    # 되돌릴 수 없는 삭제라 '한 번 눌러 끝나는' 경로를 두지 않는다.
    st.divider()
    st.subheader("유저 상세 조회 · 진행도 정정")
    st.caption(
        "특정 유저의 진행 위치와 완료 내역을 조회하고, 잘못 남은 기록을 지웁니다. "
        "삭제한 기록은 되돌릴 수 없습니다."
    )

    detail_uid, detail_email, user_doc = None, None, None

    if is_mock_mode():
        st.warning(
            "Firebase 미연결(Mock 모드)입니다. 아래는 **연습용 예시 문서**이며, 정정은 "
            "이 브라우저 세션에서만 반영되는 시뮬레이션입니다. 실제 DB에는 아무것도 쓰지 않습니다."
        )
        demo_uid, demo_doc = demo_user_document()
        # 시뮬레이션 결과가 재실행 사이에 남아야 '지워졌는지' 눈으로 확인할 수 있다.
        if MOCK_USER_DOCS_KEY not in st.session_state:
            st.session_state[MOCK_USER_DOCS_KEY] = {demo_uid: demo_doc}
        detail_uid = demo_uid
        user_doc = st.session_state[MOCK_USER_DOCS_KEY][demo_uid]
        detail_email = user_doc.get("email")
    elif df.empty:
        st.info("조회할 유저가 없습니다.")
    else:
        detail_email = st.selectbox(
            "상세를 조회할 유저 (이메일)", df["email"].tolist(), key="detail_user_email"
        )
        detail_uid = df[df["email"] == detail_email].iloc[0]["uid"]
        user_doc, _ = doc_get("users", detail_uid)
        if user_doc is None:
            st.warning(
                f"Firestore에 `users/{detail_uid}` 문서가 없습니다. "
                "Auth 계정만 있고 앱에 한 번도 로그인하지 않은 상태일 수 있습니다."
            )

    if user_doc is not None:
        st.markdown(f"**대상** — `{detail_uid}` / {detail_email}")

        tab_profile, tab_test, tab_scenario, tab_fix = st.tabs(
            ["프로필 · 동의", "검사 결과", "시나리오 진행", "진행도 정정"]
        )

        with tab_profile:
            st.markdown("**프로필**")
            st.dataframe(
                build_profile_rows(detail_uid, user_doc), use_container_width=True, hide_index=True
            )
            st.markdown("**동의 기록 (termsConsent)**")
            if has_consent(user_doc):
                st.dataframe(build_consent_rows(user_doc), use_container_width=True, hide_index=True)
            else:
                st.caption(
                    "동의 기록이 없습니다. 약관 동의 화면이 생기기 전에 가입한 계정일 수 있습니다."
                )

        with tab_test:
            for test_key, (_, test_label) in TEST_FIELDS.items():
                st.markdown(f"**{test_label}**")
                summary = build_test_summary_rows(user_doc, test_key)
                if summary.empty:
                    st.caption("아직 응시하지 않았습니다.")
                    continue
                st.dataframe(summary, use_container_width=True, hide_index=True)
                with st.expander(f"{test_label} 문항별 응답 (Raw)"):
                    st.caption("선택지 index는 문항 CSV의 options 순서(0부터)입니다.")
                    st.dataframe(
                        build_answer_rows(user_doc, test_key),
                        use_container_width=True,
                        hide_index=True,
                    )

        with tab_scenario:
            st.markdown("**영역별 진행**")
            st.caption(
                "'이어하기 위치'는 기록이 없는 가장 빠른 회차입니다. 앱이 이어하기 지점을 "
                "따로 저장하지 않고 완주 기록의 빈자리로 정하기 때문입니다."
            )
            st.dataframe(
                build_theme_progress_rows(user_doc.get("scenarios"), user_doc.get("seenReports")),
                use_container_width=True,
                hide_index=True,
            )

            st.markdown("**완료 보고서 열람 기록 (seenReports)**")
            if not has_seen_reports_field(user_doc):
                st.caption("필드가 없습니다 (열람 기록을 남기기 전에 만들어진 문서).")
            else:
                labels = seen_report_labels(user_doc)
                st.caption(", ".join(labels) if labels else "열람한 영역이 없습니다.")

            # 에필로그는 진행도(scenarios)가 아니라 users/{uid}.epilogues에
            # 따로 쌓인다 — 완주 판정의 분모에 들어가면 안 되는 기록이라
            # 프론트가 필드를 나눠 두었고, 여기서도 진행 표와 섞지 않는다.
            st.markdown("**에필로그 열람 기록 (epilogues)**")
            if not has_epilogues_field(user_doc):
                st.caption("필드가 없습니다 (에필로그를 한 번도 열지 않았거나 그 전에 만들어진 문서).")
            else:
                epi_labels = epilogue_labels(user_doc)
                st.caption(", ".join(epi_labels) if epi_labels else "열람한 에필로그가 없습니다.")

            st.markdown("**에피소드별 기록**")
            episode_rows = build_episode_rows(user_doc.get("scenarios"))
            if episode_rows.empty:
                st.caption("진행한 에피소드가 없습니다.")
            else:
                st.dataframe(episode_rows, use_container_width=True, hide_index=True)

        with tab_fix:
            st.caption(
                "지울 대상을 고르면 무엇이 사라지는지 먼저 보여 줍니다. 확인 상자를 켜야 "
                "실행 버튼이 열립니다."
            )

            def run_correction(plan, key):
                """[미리보기 → 체크박스 확인 → 실행] 3단계를 한 곳에서 처리한다.

                미리보기와 실제 쓰기가 **같은 plan 객체**에서 나오므로, 화면이
                보여 준 것과 다른 것이 지워지는 일이 구조적으로 생기지 않는다.
                """
                for line in describe_plan(plan):
                    st.write(f"- {line}")

                if not plan.allowed:
                    return
                if not plan.preview.empty:
                    st.markdown("**지워질 기록**")
                    st.dataframe(plan.preview, use_container_width=True, hide_index=True)

                st.error(f"**{plan.label}**을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.")
                confirmed = st.checkbox(
                    "위 내용을 확인했으며, 삭제에 동의합니다.", key=f"confirm_{key}"
                )
                if not st.button("삭제하기", type="primary", disabled=not confirmed, key=f"apply_{key}"):
                    return

                if is_mock_mode():
                    st.session_state[MOCK_USER_DOCS_KEY][detail_uid] = apply_plan_to_snapshot(
                        user_doc, plan
                    )
                    st.success("[시뮬레이션] 이 세션에서만 반영했습니다. 실제 DB는 그대로입니다.")
                else:
                    # merge 쓰기로는 필드가 지워지지 않는다 — DELETE_FIELD 센티널이
                    # 있어야 update mask에 삭제로 실린다 (탈퇴 버그와 같은 함정).
                    doc_set("users", detail_uid, build_deletion_payload(plan, firestore.DELETE_FIELD))
                    fetch_users_data.clear()
                    fetch_users_raw.clear()
                    st.success(f"{plan.label} 기록을 삭제했습니다.")
                st.rerun()

            scenarios = user_doc.get("scenarios")

            with st.expander("① 에피소드 1건 삭제", expanded=True):
                episode_ids = sorted(scenarios) if isinstance(scenarios, dict) else []
                if not episode_ids:
                    st.caption("삭제할 에피소드 기록이 없습니다.")
                else:
                    target_episode = st.selectbox(
                        "삭제할 에피소드", episode_ids, key="fix_episode_id"
                    )
                    run_correction(
                        plan_episode_delete(user_doc, target_episode, email=detail_email),
                        f"episode_{target_episode}",
                    )

            with st.expander("② 영역 전체 리셋"):
                theme_choice = st.selectbox(
                    "리셋할 영역",
                    list(THEME_IDS),
                    format_func=lambda tid: THEME_LABEL.get(tid, tid),
                    key="fix_theme_id",
                )
                clear_seen = st.checkbox(
                    "완료 보고서 열람 기록(seenReports)에서도 이 영역을 뺍니다",
                    value=True,
                    key="fix_clear_seen",
                    help=(
                        "끄면 진행도만 지워집니다. 열람 기록이 남으면 유저가 이 영역을 "
                        "다시 완주해도 완료 보고서가 '이미 봤다'로 처리돼 뜨지 않습니다."
                    ),
                )
                run_correction(
                    plan_theme_reset(
                        user_doc, theme_choice, email=detail_email, clear_seen_report=clear_seen
                    ),
                    f"theme_{theme_choice}",
                )

            with st.expander("③ 검사 결과 삭제"):
                st.caption("삭제하면 해당 유저는 그 검사를 처음부터 다시 볼 수 있게 됩니다.")
                test_choice = st.selectbox(
                    "삭제할 검사",
                    list(TEST_FIELDS.keys()),
                    format_func=lambda key: TEST_FIELDS[key][1],
                    key="fix_test_key",
                )
                run_correction(
                    plan_test_delete(user_doc, test_choice, email=detail_email),
                    f"test_{test_choice}",
                )

# 검사 결과 분석
elif menu == "검사 결과 분석":
    st.header("검사 결과 분석")
    st.write("유저들의 전체 검사 결과 통계를 확인합니다.")
    
    df, _, _, _ = fetch_users_data()
    
    if df.empty:
        st.info("데이터가 없습니다.")
    else:
        st.subheader("ADHD 점수 분포 (0~100 환산점수)")
        adhd_scores = pd.to_numeric(df["ADHD 점수"], errors='coerce').dropna()
        if not adhd_scores.empty:
            bins = [0, 20, 40, 60, 80, 100]
            labels = ["0-20", "21-40", "41-60", "61-80", "81-100"]
            adhd_counts = pd.cut(adhd_scores, bins=bins, labels=labels, include_lowest=True).value_counts().sort_index()
            adhd_counts.index = adhd_counts.index.astype(str)
            st.bar_chart(pd.DataFrame({"ADHD 점수 분포": adhd_counts}))
        else:
            st.info("ADHD 검사 결과가 없습니다.")
            
        st.subheader("스트레스 유형 분포")
        stress_types = df[df["스트레스 유형"] != "-"]["스트레스 유형"].dropna()
        if not stress_types.empty:
            stress_counts = stress_types.value_counts()
            stress_counts.index = stress_counts.index.astype(str)
            st.bar_chart(pd.DataFrame({"스트레스 유형 분포": stress_counts}))
        else:
            st.info("스트레스 검사 결과가 없습니다 (새 스키마 적용 전일 수 있습니다).")

    # ─── 연구용 데이터 내보내기 ─────────────────────────────────
    # 이 메뉴에 둔 이유: 산출물의 용도가 효과 검증 결과보고서라 통계 화면과 목적이
    # 같습니다. '유저 관리'는 정지·삭제 같은 개별 응대 창구이고 화면 자체가 이메일
    # 중심이라, 마스킹을 기본값으로 두는 기능과 성격이 어긋납니다.
    st.divider()
    st.subheader("연구용 데이터 내보내기")
    st.caption(
        "유저별로 검사 결과와 시나리오 진행 요약을 한 행씩 편 CSV를 내려받습니다. "
        "엑셀에서 바로 열 수 있도록 UTF-8(BOM) 로 저장됩니다."
    )

    masked = st.checkbox(
        "개인정보 마스킹 (권장)",
        value=True,
        key="export_mask",
        help="uid를 SHA-256 앞 10자로 대체하고 이메일·이름·프로필 사진·캐릭터 닉네임 열을 아예 만들지 않습니다.",
    )

    if masked:
        st.caption(
            "마스킹 ON — 같은 이용자는 항상 같은 해시가 되므로 개체 추적(사전·사후 대응)은 그대로 됩니다."
        )
    else:
        st.error(
            "**마스킹 OFF — 연구 목적 외 반출 금지.** 이메일·이름·닉네임과 uid 원문이 그대로 나갑니다. "
            "내려받은 파일은 공용 드라이브나 메신저에 올리지 마시고, 분석이 끝나면 삭제하세요. "
            "이 설정은 브라우저 세션이 끝나면 다시 마스킹 ON으로 돌아갑니다."
        )

    if is_mock_mode():
        st.warning("Firebase 미연결(Mock 모드)이라 내보낼 이용자 데이터가 없습니다. 열 구성만 확인할 수 있습니다.")
        st.caption("열 구성: " + ", ".join(export_columns(mask=masked)))
    elif st.button("내보낼 데이터 준비하기"):
        st.session_state["export_ready"] = True

    if not is_mock_mode() and st.session_state.get("export_ready"):
        users_raw = fetch_users_raw()
        export_df = build_export_dataframe(users_raw, mask=masked)
        st.write(f"{len(export_df)}명 / {len(export_df.columns)}개 열")
        st.dataframe(export_df.head(20).astype(str), use_container_width=True)
        st.download_button(
            "CSV 내려받기",
            data=to_csv_bytes(export_df),
            file_name=export_filename(mask=masked),
            mime="text/csv",
            type="primary",
            key="download_research_csv",
        )
        st.caption(
            "adhd_score_band는 위 히스토그램과 같은 표시용 구간이며 임상 절단점이 아닙니다. "
            "helpful_rate는 완주 기록이 없으면 빈 칸입니다(0%와 구분)."
        )

# 문항 관리 (CSV)
elif menu == "문항 관리 (CSV)":
    st.header("검사 문항 관리")
    st.write("Firestore에 저장된 문항을 직접 수정하거나, CSV 파일로 덮어쓸 수 있습니다.")
    
    if is_mock_mode():
        st.warning(
            "Firebase 미연결(Mock 모드)입니다. 아래 편집·업로드·되돌리기는 **이 브라우저 세션에서만** "
            "유지되고 실제 DB에는 반영되지 않습니다. 절차를 연습해 보는 용도로 쓰세요."
        )

    test_type = st.selectbox("검사 유형 선택", list(QUESTION_SPECS.keys()))
    q_spec = QUESTION_SPECS[test_type]
    doc_id = q_spec["doc_id"]

    doc_data, doc_updated_at = doc_get('questions', doc_id)

    # 1. DB에서 데이터 불러오기 또는 Seed
    csv_text = ""
    if doc_data is None:
        st.info(f"DB에 {test_type} 문항이 없습니다. 로컬 CSV에서 초기화(Seed)를 시도합니다.")
        try:
            csv_text = (DATA_DIR / q_spec["filename"]).read_text(encoding='utf-8-sig')
            doc_set('questions', doc_id, {CSV_TEXT_FIELD: csv_text})
            st.success(f"{test_type} 초기화 완료!")
        except Exception as e:
            st.error(f"초기화 실패: {e}")
    else:
        csv_text = doc_data.get(CSV_TEXT_FIELD, "")

    # 2. 에디터 표시
    if csv_text:
        # CSV는 텍스트다 — 전 컬럼 문자열 로드로 Arrow 세그폴트를 막고,
        # 에디터 저장 시 숫자 재해석으로 원문이 변형되는 것도 방지한다.
        df = pd.read_csv(StringIO(csv_text), dtype=str).fillna("")
        st.subheader(f"현재 {test_type} 문항 표")
        edited_df = st.data_editor(df, num_rows="dynamic", use_container_width=True)

        col_save, col_download = st.columns(2)
        with col_save:
            if st.button("표 변경사항 DB에 저장"):
                save_csv_text('questions', doc_id, edited_df.to_csv(index=False), csv_text, doc_updated_at)
                st.success("DB에 업데이트 되었습니다!")
                st.rerun()
        with col_download:
            render_csv_download(csv_text, q_spec["filename"], key=f"download_questions_{doc_id}")

    st.divider()
    st.subheader("새 CSV 파일로 덮어쓰기 (업로드)")
    render_repo_sync_notice(q_spec["filename"])
    uploaded_file = st.file_uploader(f"{test_type} 새 CSV 업로드", type=["csv"])
    if uploaded_file is not None:
        upload_df = pd.read_csv(uploaded_file, dtype=str).fillna("")
        st.write("미리보기:")
        st.dataframe(upload_df.head())

        errors, warnings = validate_questions_df(upload_df, doc_id)
        for msg in errors:
            st.error(msg)
        for msg in warnings:
            st.warning(msg)

        if errors:
            st.info("치명적 오류를 수정한 뒤 다시 업로드하세요. 이 상태로는 저장할 수 없습니다.")
        elif st.button("DB에 일괄 덮어쓰기"):
            save_csv_text('questions', doc_id, upload_df.to_csv(index=False), csv_text, doc_updated_at)
            st.success("DB에 덮어쓰기 완료!")
            st.rerun()

    st.divider()
    render_rollback_section('questions', doc_id, doc_data, csv_text, test_type)

# 시나리오 관리 (CSV)
elif menu == "시나리오 관리 (CSV)":
    st.header("시나리오 관리")
    st.caption(
        "앱은 여기 업로드한 CSV를 우선 사용하고, 문서가 없으면 프론트엔드에 내장된 로컬 CSV로 "
        "자동 폴백합니다. 폴백은 사용자 화면에 아무 경고도 남기지 않으므로, 업로드 후 아래 상태 표시를 반드시 확인하세요."
    )

    if is_mock_mode():
        st.warning(
            "Firebase 미연결(Mock 모드)입니다. 아래 업로드·되돌리기는 **이 브라우저 세션에서만** "
            "유지되고 실제 DB에는 반영되지 않습니다. 절차를 연습해 보는 용도로 쓰세요."
        )

    label = st.radio("관리할 CSV 종류", list(SCENARIO_SPECS.keys()), horizontal=True)
    spec = SCENARIO_SPECS[label]
    doc_id = spec["doc_id"]
    doc_data, doc_updated_at = doc_get('scenarios', doc_id)

    # 1. 현재 DB 상태
    current_csv = doc_data.get(CSV_TEXT_FIELD, "") if doc_data else ""

    if current_csv:
        # 시나리오 CSV는 빈 칸(NaN)이 많아 Arrow 세그폴트의 주범이다 — 문자열 로드 필수.
        current_df = pd.read_csv(StringIO(current_csv), dtype=str).fillna("")
        st.success(
            f"DB 반영됨 — scenarios/{doc_id} · {len(current_df)}행 / {len(current_df.columns)}열"
            + (f" · 갱신 {format_timestamp(doc_updated_at)}" if doc_updated_at else "")
        )
        with st.expander("현재 DB 내용 미리보기"):
            st.dataframe(current_df.head(20), use_container_width=True)
        render_csv_download(current_csv, spec["filename"], key=f"download_scenario_{doc_id}")
    else:
        st.warning(
            f"DB에 scenarios/{doc_id} 문서가 없습니다. "
            "앱은 현재 프론트엔드에 내장된 로컬 CSV를 사용 중입니다."
        )
        if st.button("로컬 CSV로 초기화 (Seed)"):
            try:
                seed_text = (DATA_DIR / spec["filename"]).read_text(encoding='utf-8-sig')
                doc_set('scenarios', doc_id, {CSV_TEXT_FIELD: seed_text})
                st.success("초기화 완료!")
                st.rerun()
            except FileNotFoundError:
                st.error(
                    f"로컬 CSV를 찾을 수 없습니다: {DATA_DIR / spec['filename']} — "
                    "프론트엔드 코드가 함께 체크아웃된 환경에서만 동작합니다."
                )
            except Exception as e:
                st.error(f"초기화 실패: {e}")

    st.divider()

    # 2. 업로드
    st.subheader("새 CSV 파일로 덮어쓰기")
    st.caption(spec["spec_hint"])
    render_repo_sync_notice(spec["filename"])
    uploaded = st.file_uploader(
        f"{label} CSV 업로드", type=["csv"], key=f"scenario_upload_{doc_id}"
    )

    if uploaded is not None:
        # 원문을 그대로 보관합니다. pandas 왕복(read_csv → to_csv)을 거치면
        # 따옴표와 빈 칸 처리가 바뀌어 프론트엔드 파서와 어긋날 수 있습니다.
        raw_text = uploaded.getvalue().decode('utf-8-sig')
        try:
            upload_df = pd.read_csv(StringIO(raw_text), dtype=str).fillna("")
        except Exception as e:
            st.error(f"CSV를 읽을 수 없습니다: {e}")
            upload_df = None

        if upload_df is not None:
            st.write(f"미리보기 — {len(upload_df)}행 / {len(upload_df.columns)}열")
            st.dataframe(upload_df.head(10), use_container_width=True)

            # 요정 조언 CSV는 조인 키가 DOMAIN 하나뿐이고, 에필로그는
            # (DOMAIN, SCENE_NUM) 두 열이다 — 둘 다 열 개수로는 검증할 수 없어
            # 전용 함수를 쓴다.
            if doc_id == "angels":
                errors, warnings = validate_angels_df(upload_df)
            elif doc_id == "epilogue":
                errors, warnings = validate_epilogue_df(upload_df)
            else:
                errors, warnings = validate_scenario_df(upload_df, doc_id, spec["min_cols"])

            for msg in errors:
                st.error(msg)
            for msg in warnings[:10]:
                st.warning(msg)
            if len(warnings) > 10:
                st.caption(f"… 외 경고 {len(warnings) - 10}건")

            if errors:
                st.info("치명적 오류를 수정한 뒤 다시 업로드하세요. 이 상태로는 저장할 수 없습니다.")
            elif st.button("DB에 덮어쓰기", type="primary"):
                save_csv_text('scenarios', doc_id, raw_text, current_csv, doc_updated_at)
                st.success("DB에 반영되었습니다. 앱을 새로고침하면 적용됩니다.")
                st.rerun()

    # 3. 되돌리기
    st.divider()
    render_rollback_section('scenarios', doc_id, doc_data, current_csv, label)

    # 4. 조인 정합성 검사
    st.divider()
    st.subheader("조인 키 정합성 검사")
    st.caption(
        "비주얼과 대사는 '{NO}_{DOMAIN}_{REACTION_TYPE}' 키로 병합됩니다. "
        "한쪽에만 있는 키는 앱에서 빈 대사 또는 누락으로 나타납니다. "
        "요정 조언·에필로그는 조인 키가 달라 이 대조 대상이 아닙니다."
    )

    if st.button("두 문서 대조하기"):
        try:
            docs = {d: doc_get('scenarios', d)[0] for d in ("visual", "dialogue")}
            missing_docs = [d for d, data in docs.items() if not data]

            if missing_docs:
                st.warning(f"DB에 없는 문서가 있어 대조할 수 없습니다: {', '.join(missing_docs)}")
            else:
                key_sets = {}
                for d, data in docs.items():
                    d_df = pd.read_csv(StringIO(data.get(CSV_TEXT_FIELD, "")))
                    key_sets[d] = set(build_join_keys(d_df))

                only_visual = sorted(key_sets["visual"] - key_sets["dialogue"])
                only_dialogue = sorted(key_sets["dialogue"] - key_sets["visual"])

                if not only_visual and not only_dialogue:
                    st.success(f"정상 — 양쪽 모두 {len(key_sets['visual'])}개 키가 일치합니다.")
                if only_visual:
                    st.error(
                        f"대사가 없는 비주얼 {len(only_visual)}건 (앱에서 빈 대사로 표시): "
                        + ", ".join(only_visual[:10])
                    )
                if only_dialogue:
                    st.warning(
                        f"비주얼이 없는 대사 {len(only_dialogue)}건 (앱에서 무시됨): "
                        + ", ".join(only_dialogue[:10])
                    )
        except Exception as e:
            st.error(f"대조 실패: {e}")

# 약관·공지 관리
#
# 법무 문서 전문과 운영 정보(보호책임자 성명, 연락처 2종)는 원래 프론트엔드
# 코드(constants/legal.ts)에만 있어서, 담당자 이름 한 글자를 바꾸는 데도
# 개발자가 빌드·배포를 해야 했다. 사업 종료 후에는 팀이 개발자 없이 유지해야
# 하므로 questions·scenarios와 같은 계약으로 뺐다 — DB에 값이 있으면 그것을
# 쓰고, 없으면 코드 상수로 조용히 폴백한다.
#
# 공지 배너도 여기서 관리한다. 처리방침 제11조가 "서비스 내 공지"로 변경을
# 알리겠다고 약속하는데 정작 공지 수단이 없었다.
elif menu == "약관·공지 관리":
    st.header("약관·공지 관리")
    st.caption(
        "앱은 여기 저장한 값을 우선 사용하고, 값이 없으면 프론트엔드 코드의 기본값으로 "
        "자동 폴백합니다. 폴백은 사용자 화면에 아무 표시도 남기지 않으므로, 저장 후 아래 "
        "'코드 기본값 대비 현재 상태'를 반드시 확인하세요."
    )

    if is_mock_mode():
        st.warning(
            "Firebase 미연결(Mock 모드)입니다. 아래 편집·저장·되돌리기는 **이 브라우저 세션에서만** "
            "유지되고 실제 DB에는 반영되지 않습니다. 절차를 연습해 보는 용도로 쓰세요."
        )

    legal_data, legal_updated_at = doc_get(SETTINGS_COLLECTION, LEGAL_DOC_ID)
    legal_data = legal_data or {}

    # 코드 기본값(legal.ts) 읽기. 저장소 체크아웃이 없으면 배포 스크립트가
    # 실어 보낸 frontend_snapshot/legal.ts로 폴백한다(경로 해석은 settings_utils).
    # 둘 다 없으면 대조표만 접고 나머지 편집 기능은 그대로 쓸 수 있게 둔다.
    legal_source = None
    code_defaults = None
    code_defaults_error = None
    try:
        legal_source = load_legal_source()
        code_defaults = parse_legal_defaults(legal_source.text)
    except Exception as e:
        code_defaults_error = str(e)

    # 화면에 표시할 현재 유효값 — DB에 없으면 코드 기본값을 미리 채워 둔다.
    # 빈 칸으로 두면 운영팀이 "지워진 건가?"로 읽고, 무심코 저장하면 실제로
    # 빈 값이 DB에 박힌다.
    def _effective(field, fallback_key=None):
        value = legal_data.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if code_defaults:
            return code_defaults.get(fallback_key or field) or ""
        return ""

    tab_info, tab_terms, tab_privacy, tab_marketing, tab_notice, tab_history = st.tabs(
        [
            "운영 정보",
            "이용약관 전문",
            "개인정보 처리방침 전문",
            "마케팅 수신 동의",
            "공지 배너",
            "저장 이력",
        ]
    )

    # ── 탭 1. 운영 정보 + 드리프트 대조 ──────────────────────────
    with tab_info:
        st.subheader("운영 정보")
        st.caption(
            "보호책임자 성명과 연락처는 처리방침 제10조 본문에 자동으로 들어갑니다 — "
            "조항을 직접 고칠 필요가 없습니다."
        )

        officer_name = st.text_input(
            "개인정보 보호책임자 성명", value=_effective(OFFICER_NAME_FIELD), key="legal_officer_name"
        )
        contact_email = st.text_input(
            "보호책임자 연락처 (처리방침 제10조 · 법정 고지)",
            value=_effective(CONTACT_EMAIL_FIELD),
            key="legal_contact_email",
        )
        inquiry_email = st.text_input(
            "1:1 문의 주소 (마이페이지 문의 창구)",
            value=_effective(INQUIRY_EMAIL_FIELD),
            key="legal_inquiry_email",
        )
        version = st.text_input(
            "법무 문서 버전 (동의 기록에 함께 남습니다)",
            value=_effective(VERSION_FIELD),
            key="legal_version",
            help="처리방침의 시행일과 같게 맞춥니다. 약관 본문을 고치면 이 값도 새 시행일로 올리세요.",
        )

        if st.button("운영 정보 저장", type="primary", key="save_legal_info"):
            info_errors = [
                f"{label}을(를) 입력하세요."
                for value, label in (
                    (officer_name, "보호책임자 성명"),
                    (contact_email, "보호책임자 연락처"),
                    (inquiry_email, "1:1 문의 주소"),
                    (version, "법무 문서 버전"),
                )
                if not str(value).strip()
            ]
            for msg in info_errors:
                st.error(msg)

            if not info_errors:
                save_legal(
                    build_legal_payload(
                        {
                            **legal_data,
                            OFFICER_NAME_FIELD: officer_name.strip(),
                            CONTACT_EMAIL_FIELD: contact_email.strip(),
                            INQUIRY_EMAIL_FIELD: inquiry_email.strip(),
                            VERSION_FIELD: version.strip(),
                        },
                        legal_data,
                        legal_updated_at,
                    )
                )
                st.success("저장했습니다. 앱을 새로고침하면 적용됩니다.")
                st.rerun()

        st.divider()
        st.subheader("코드 기본값 대비 현재 상태")

        if code_defaults_error:
            st.info(
                "프론트엔드 코드(`../syu-react-frontend/src/constants/legal.ts`)를 읽을 수 없어 "
                f"대조를 건너뜁니다. 저장소 전체가 있는 환경에서만 동작합니다. (사유: {code_defaults_error})"
            )
        else:
            # 컨테이너에서는 배포 시점에 고정된 사본을 읽는다 — 언제 것인지
            # 밝히지 않으면 낡은 기본값을 현재 코드로 착각한다.
            snapshot_line = snapshot_notice(legal_source)
            if snapshot_line:
                st.caption(snapshot_line)

            st.dataframe(
                compare_legal_drift(code_defaults, legal_data),
                use_container_width=True,
                hide_index=True,
            )
            st.caption(
                "'DB 미설정'인 항목은 앱이 코드 기본값을 씁니다. 그 값을 바꾸려면 여기서 저장하세요."
            )

        st.divider()
        st.subheader("이전 버전으로 되돌리기")

        if not can_rollback_legal(legal_data):
            st.caption(
                "보관된 이전 버전이 없습니다. 이 화면에서 한 번 저장하면 그때의 내용이 "
                "자동으로 보관되어 되돌릴 수 있게 됩니다."
            )
        else:
            previous_legal = legal_data.get(PREVIOUS_LEGAL_FIELD) or {}
            st.dataframe(
                compare_legal_versions(
                    legal_data, previous_legal, legal_data.get(PREVIOUS_UPDATED_AT_FIELD)
                ),
                use_container_width=True,
                hide_index=True,
            )
            st.warning(
                "되돌리면 운영 정보와 약관·처리방침·마케팅 동의 전문, 마케팅 항목 표시 설정이 "
                "**함께** 직전 상태로 돌아갑니다. "
                "현재 버전은 버려지지 않고 '이전 버전' 자리로 들어가므로, 한 번 더 누르면 "
                "지금 상태로 복구됩니다."
            )
            if st.button("이전 버전으로 되돌리기", key="rollback_legal"):
                # 되돌리기도 이력에 남긴다 — 게시되는 문안이 바뀌는 동작이므로,
                # 빼면 "그때 무엇이 걸려 있었나"의 답에 구멍이 생긴다.
                save_legal(
                    build_legal_rollback_payload(legal_data, previous_legal, legal_updated_at)
                )
                st.success("이전 버전으로 되돌렸습니다. 앱을 새로고침하면 적용됩니다.")
                st.rerun()

    # ── 탭 2·3·4. 약관 / 처리방침 / 마케팅 전문 ──────────────────
    #
    # 세 탭의 편집 절차가 같아 함수로 묶는다. 조항 배열이라는 구조가 같고,
    # 다른 것은 문서 이름과 필드명뿐이다.
    #
    # has_officer_section은 "이 문서에 보호책임자 조항이 있는가"다. 처리방침
    # 제10조와 마케팅 제9조가 여기 해당하며, 그 본문은 표에 무엇을 적든 앱이
    # 운영 정보에서 다시 만든다 — 미리보기도 같은 결과를 보여 줘야 운영팀이
    # 확인한 것과 게시되는 것이 일치한다.
    def render_sections_editor(label, field, has_officer_section=False):
        st.subheader(f"{label} 전문")

        db_sections = normalize_sections(legal_data.get(field))
        if db_sections is None:
            st.info(
                f"DB에 {label} 전문이 없습니다. 앱은 프론트엔드 코드의 기본값을 쓰고 있습니다. "
                "아래 표에서 조항을 입력해 저장하면 그때부터 DB 값이 우선합니다."
            )
        else:
            st.success(f"DB 반영됨 — {len(db_sections)}개 조항")

        st.caption(
            "본문의 줄바꿈은 앱에서도 그대로 줄바꿈으로 표시됩니다. "
            "조항 제목은 목록의 식별자로 쓰이므로 중복될 수 없습니다."
        )

        edited = st.data_editor(
            pd.DataFrame(
                sections_to_records(db_sections) or [{SECTION_HEADING_COLUMN: "", SECTION_BODY_COLUMN: ""}]
            ),
            num_rows="dynamic",
            use_container_width=True,
            key=f"editor_{field}",
            column_config={
                SECTION_BODY_COLUMN: st.column_config.TextColumn(SECTION_BODY_COLUMN, width="large"),
            },
        )

        sections = records_to_sections(edited.to_dict("records"))
        errors, warnings = validate_sections(sections, label)

        for msg in errors:
            st.error(msg)
        for msg in warnings[:10]:
            st.warning(msg)
        if len(warnings) > 10:
            st.caption(f"… 외 경고 {len(warnings) - 10}건")

        # 미리보기는 앱이 실제로 그릴 내용이어야 한다 — 처리방침은 보호책임자
        # 조항을 운영 정보에서 다시 만들어 넣는다(앱과 같은 규칙).
        preview_sections = (
            preview_privacy_sections(
                sections, _effective(OFFICER_NAME_FIELD), _effective(CONTACT_EMAIL_FIELD)
            )
            if has_officer_section
            else sections
        )

        with st.expander(f"미리보기 — 앱에 표시될 {label} 전문", expanded=False):
            if has_officer_section:
                st.caption(
                    "보호책임자 조항의 본문은 '운영 정보' 탭의 성명·연락처에서 자동으로 만들어집니다. "
                    "표에 무엇을 적든 아래 내용으로 대체됩니다."
                )
            st.text(sections_to_text(preview_sections) or "(조항이 없습니다)")

        if errors:
            st.info("오류를 수정한 뒤 다시 저장하세요. 이 상태로는 저장할 수 없습니다.")
        elif st.button(f"{label} 전문 저장", type="primary", key=f"save_{field}"):
            save_legal(
                build_legal_payload(
                    {**legal_data, field: sections}, legal_data, legal_updated_at
                )
            )
            st.success("저장했습니다. 앱을 새로고침하면 적용됩니다.")
            st.rerun()

    with tab_terms:
        render_sections_editor("이용약관", TERMS_SECTIONS_FIELD)

    with tab_privacy:
        render_sections_editor(
            "개인정보 처리방침", PRIVACY_SECTIONS_FIELD, has_officer_section=True
        )

    # ── 탭 4. 마케팅 수신 동의 ───────────────────────────────────
    #
    # 다른 두 문서와 달리 **표시할지 자체가 미정**이라(2026-08-18) 문안 편집
    # 위에 표시 스위치를 둔다. 서비스에 마케팅 동의가 필요한지는 운영·법무
    # 판단이고, 그때마다 개발자가 배포하지 않아도 되게 하려는 것이다.
    #
    # 스위치와 문안을 따로 저장하는 이유는 수명이 다르기 때문이다 — 끄고 켜는
    # 일은 자주 있어도 문안은 법무 검토를 거쳐야 바뀐다. 한 버튼으로 묶으면
    # 스위치만 만지려다 편집 중이던 표까지 함께 저장된다.
    with tab_marketing:
        st.subheader("마케팅 정보 수신 동의")
        st.caption(
            "동의 화면의 선택 항목입니다. 끄면 항목 행 자체가 화면에서 빠지며, 필수 동의"
            "(이용약관·개인정보 처리방침)에는 영향을 주지 않습니다. 이미 저장된 사용자의 "
            "동의 기록은 그대로 남습니다."
        )

        st.info(f"현재 상태 — {marketing_status_label(legal_data)}")

        marketing_enabled = st.toggle(
            "동의 화면에 마케팅 수신 동의 항목 표시",
            value=resolve_marketing_enabled(legal_data),
            key="legal_marketing_enabled",
        )

        if not marketing_enabled:
            st.caption(
                "끈 상태로 저장하면 앱의 동의 화면에서 항목이 사라집니다. 아래 문안은 "
                "지워지지 않고 그대로 보관되므로, 다시 켜면 같은 전문이 표시됩니다."
            )

        if st.button("표시 설정 저장", type="primary", key="save_marketing_enabled"):
            save_legal(
                build_legal_payload(
                    {**legal_data, MARKETING_CONSENT_ENABLED_FIELD: bool(marketing_enabled)},
                    legal_data,
                    legal_updated_at,
                )
            )
            st.success("저장했습니다. 앱을 새로고침하면 적용됩니다.")
            st.rerun()

        # ── 동의자 이메일 일괄 추출 (BCC 붙여넣기용) ──────────────
        # 이 메뉴에 둔 이유: 마케팅 동의의 표시 여부·문안과 '누가 동의했는가'가
        # 한 화면에 모여야 발송 직전에 근거를 함께 확인할 수 있습니다.
        # '유저 관리'는 정지·삭제 같은 개별 응대 창구라 일괄 반출과 성격이
        # 다릅니다(연구용 내보내기를 '검사 결과 분석'에 둔 것과 같은 판단).
        #
        # 어드민은 메일을 보내지 않습니다 — 주소를 모아 줄 뿐입니다. 발송 수단을
        # 여기에 붙이면 '눌렀더니 나갔다'가 되고, 그 실수는 되돌릴 수 없습니다.
        st.divider()
        st.subheader("동의자 이메일 일괄 추출 (BCC 붙여넣기용)")
        st.caption(
            "마케팅 정보 수신에 동의한 이용자의 이메일 주소를 한 줄로 모아 줍니다. "
            "발송은 이 화면에서 하지 않습니다 — 아래 목록을 복사해 메일 클라이언트에 "
            "붙여 넣어 보내십시오."
        )

        st.error(
            "**받는사람(To)·참조(CC)가 아니라 반드시 숨은참조(BCC)에 붙여넣으십시오.** "
            "To/CC로 보내면 동의자 전원의 주소가 서로에게 그대로 노출됩니다. "
            "한 번 나간 메일은 회수할 수 없으며, 개인정보 유출 사고로 신고 대상이 됩니다."
        )
        st.warning(
            "**개인정보 목적 외 사용 금지.** 이 목록은 동의받은 광고성 정보 발송에만 쓰실 수 "
            "있습니다. 다른 용도로 쓰거나 외부(공용 드라이브·메신저·협력사)에 공유하지 마시고, "
            "발송이 끝나면 내려받은 파일을 삭제하십시오. 발송하실 때는 정보통신망법 제50조에 "
            "따라 제목에 (광고) 표기와 본문에 무료 수신거부 방법을 함께 적으셔야 합니다."
        )

        if is_mock_mode():
            st.info(
                "Firebase 미연결(Mock 모드)입니다. 아래는 **연습용 예시 데이터**이며 실제 "
                "이용자 주소가 아닙니다. 절차를 밟아 보는 용도로 쓰세요."
            )

        if st.button("동의자 이메일 추출하기", key="extract_marketing_recipients"):
            st.session_state[MARKETING_RECIPIENTS_READY] = True

        if st.session_state.get(MARKETING_RECIPIENTS_READY):
            recipient_users = demo_marketing_users() if is_mock_mode() else fetch_users_raw()
            summary = summarize_recipients(recipient_users)
            emails = recipient_emails(recipient_users)

            st.write(
                f"**수신자 {summary['recipients']}명** — 현재 수신 동의 상태인 "
                f"{summary['agreed']}명 중 이메일 없음 {summary['missing_email']}명, "
                f"주소 중복 {summary['duplicates']}명을 뺀 수입니다 "
                f"(전체 {summary['total']}명)."
            )
            # 제외 인원을 0명이어도 적는다. 숨기면 목록이 어제보다 줄었을 때
            # 그 이유가 '철회'인지 '조회 누락'인지 알 수 없고, 그러면 옛 목록을
            # 다시 쓰는 쪽으로 기울게 된다 — 철회한 사람에게 광고를 보내는 일이다.
            st.write(
                f"가입 시 동의했다가 마이페이지에서 수신을 거부한 "
                f"**{summary['opted_out']}명은 이미 제외**했습니다."
            )
            # 동의 철회는 이 목록에 소급되지 않는다. 어제 뽑아 둔 줄을 오늘 붙여
            # 넣으면 그 사이 철회한 사람에게도 광고가 나간다.
            st.caption(
                f"**{extracted_at_label()} 기준 스냅샷입니다.** 추출한 뒤에 동의를 철회한 "
                "이용자는 이 목록에 반영되지 않으므로, 발송 직전에 다시 추출해서 쓰십시오."
            )

            if not emails:
                st.info("마케팅 수신에 동의한 이용자가 아직 없습니다.")
            else:
                st.code(emails_to_line(emails), language=None)
                recipient_df = build_recipient_dataframe(recipient_users)
                st.dataframe(recipient_df.astype(str), use_container_width=True, hide_index=True)
                st.download_button(
                    "CSV 내려받기",
                    data=to_csv_bytes(recipient_df),
                    file_name=recipient_filename(),
                    mime="text/csv",
                    key="download_marketing_recipients",
                )

        st.divider()
        st.warning(
            "아래 문안의 **최종 법무 검토는 아직 팀의 몫**입니다(2026-08-18 작성). "
            "이용약관·개인정보 처리방침과의 정합성과 실제 발송 수단(전자우편 한 가지)은 "
            "2026-08-26에 맞췄고, 남은 것은 문장 자체의 검토입니다. "
            "실제로 광고성 정보를 보내기 전에 검토 결과를 확인하십시오."
        )
        render_sections_editor(
            "마케팅 정보 수신 동의", MARKETING_SECTIONS_FIELD, has_officer_section=True
        )

    # ── 탭 5. 공지 배너 ──────────────────────────────────────────
    with tab_notice:
        st.subheader("공지 배너")
        st.caption(
            "켜면 앱 최상단에 배너가 뜹니다. 사용자는 배너를 닫을 수 있고, 새 공지를 올리면 "
            "닫았던 사용자에게도 다시 표시됩니다. 문구는 합쇼체로 씁니다."
        )

        notice_data, _ = doc_get(SETTINGS_COLLECTION, NOTICE_DOC_ID)
        notice_data = notice_data or {}

        st.info(f"현재 상태 — {notice_status_label(notice_data)}")

        notice_active = st.toggle(
            "공지 배너 켜기",
            value=notice_data.get(NOTICE_ACTIVE_FIELD) is True,
            key="notice_active",
        )
        notice_message = st.text_area(
            "공지 내용",
            value=str(notice_data.get(NOTICE_MESSAGE_FIELD) or ""),
            height=120,
            key="notice_message",
            help="줄바꿈은 앱에서도 그대로 표시됩니다.",
        )

        if notice_active and not notice_message.strip():
            st.warning("공지를 켰지만 내용이 비어 있습니다. 이대로 저장하면 배너가 뜨지 않습니다.")

        if st.button("공지 저장", type="primary", key="save_notice"):
            # 공지는 이력에 남기지 않는다 — 증빙 대상이 아니고 자주 바뀌어서,
            # 함께 쌓으면 정작 찾아야 할 약관 이력이 묻힌다.
            doc_set(
                SETTINGS_COLLECTION,
                NOTICE_DOC_ID,
                build_notice_payload(notice_active, notice_message),
            )
            st.success("저장했습니다. 앱을 새로고침하면 적용됩니다.")
            st.rerun()

    # ── 탭 6. 저장 이력 ──────────────────────────────────────────
    #
    # 되돌리기는 1단계뿐이라 "직전 것"까지만 알 수 있다. 약관은 동의 증빙
    # 대상이라 "그 사람이 동의한 시점에 무엇이 걸려 있었나"를 답할 수 있어야
    # 해서, 저장할 때마다 payload 전체를 settings_history에 쌓는다.
    with tab_history:
        st.subheader("약관 저장 이력")
        st.caption(
            f"약관·처리방침·마케팅 동의·운영 정보를 저장하거나 되돌릴 때마다 그 시점의 내용이 통째로 "
            f"기록됩니다. 최근 {HISTORY_LIMIT}건까지 보여 주며, **읽기 전용**입니다 — "
            "여기서 되돌릴 수는 없습니다(되돌리기는 '운영 정보' 탭의 1단계 기능입니다). "
            "공지 배너는 증빙 대상이 아니라 기록하지 않습니다."
        )

        if is_mock_mode():
            st.info(
                "[시뮬레이션] Mock 모드라 이력도 이 브라우저 세션에만 쌓입니다. "
                "탭을 닫으면 사라지며 실제 DB에는 아무것도 쓰지 않습니다."
            )

        # 표·라벨·상세가 **같은 순서**를 보도록 한 번 더 정렬해 고정한다.
        # 라벨의 위치로 원본 항목을 되찾기 때문에 순서가 어긋나면 엉뚱한 기록의
        # 상세가 뜬다.
        history_entries = sort_history(history_fetch())

        if not history_entries:
            st.caption(
                "아직 기록이 없습니다. 이 메뉴에서 한 번 저장하면 그때부터 쌓입니다. "
                "(이 기능이 생기기 전에 저장한 내용은 남아 있지 않습니다.)"
            )
        else:
            st.dataframe(
                build_history_rows(history_entries),
                use_container_width=True,
                hide_index=True,
            )

            labels = history_entry_labels(history_entries)
            picked = st.selectbox(
                "상세를 볼 기록", labels, key="history_pick", index=0
            )
            entry = history_entries[labels.index(picked)] if picked in labels else None

            if entry is not None:
                st.markdown("**그 시점의 조항 제목**")
                titles = history_section_titles(entry)
                if titles.empty:
                    st.caption(
                        "이 기록에는 조항 배열이 없습니다 (운영 정보만 바꾼 저장입니다)."
                    )
                else:
                    st.dataframe(titles, use_container_width=True, hide_index=True)
