# csv_validation.py
# 시나리오 CSV 업로드 전 검증 로직 — streamlit_app.py에서 추출한 순수 함수 모듈.
# Streamlit 의존성이 없어 pytest로 직접 테스트한다.

JOIN_KEY_COLS = ["NO", "DOMAIN", "REACTION_TYPE"]


def build_join_keys(df):
    """프론트엔드와 동일한 방식으로 조인 키를 만듭니다: '{NO}_{DOMAIN}_{REACTION_TYPE}'"""
    return (
        df["NO"].astype(str).str.strip()
        + "_" + df["DOMAIN"].astype(str).str.strip()
        + "_" + df["REACTION_TYPE"].astype(str).str.strip()
    )


def validate_scenario_df(df, doc_id, min_cols):
    """업로드 전 검증. 반환: (치명적 오류 목록, 경고 목록)"""
    errors = []
    warnings = []

    if len(df.columns) < min_cols:
        errors.append(
            f"열이 {len(df.columns)}개뿐입니다. 최소 {min_cols}개가 필요하며, "
            "기준에 못 미치는 행은 앱에서 아무 오류 없이 통째로 사라집니다."
        )

    missing = [c for c in JOIN_KEY_COLS if c not in df.columns]
    if missing:
        errors.append(f"필수 열이 없습니다: {', '.join(missing)}")
        return errors, warnings

    # 조인 키를 '_'로 이어 붙이기 때문에, 값 자체에 '_'가 있으면 앱에서 필드가 밀립니다.
    for col in JOIN_KEY_COLS:
        bad_values = df[df[col].astype(str).str.contains("_", na=False)][col].astype(str).unique()
        if len(bad_values) > 0:
            errors.append(
                f"{col} 값에 언더스코어(_)가 있습니다: {', '.join(bad_values[:5])} — "
                "조인 키가 밀려 앱에서 잘못된 영역/반응유형으로 표시됩니다."
            )

    # 대사는 에피소드당 씬 1~4가 모두 있어야 합니다.
    # 결번이 있으면 뒤쪽 대사가 앞 씬으로 당겨져 배경과 어긋납니다.
    if doc_id == "dialogue" and "SCENE_NUM" in df.columns:
        try:
            for key, group in df.groupby(JOIN_KEY_COLS):
                scenes = sorted(int(v) for v in group["SCENE_NUM"])
                if scenes != [1, 2, 3, 4]:
                    warnings.append(f"{'/'.join(map(str, key))}: 씬 번호가 {scenes} 입니다 (1~4 필요).")
        except (ValueError, TypeError):
            errors.append("SCENE_NUM에 숫자가 아닌 값이 있습니다.")

    return errors, warnings


# 요정 조언 CSV(scenario_angels.csv)의 열 이름.
# 프론트 파서(src/utils/scenarioAngelsCsvParser.ts)는 열 위치가 아니라 **헤더
# 이름**으로 읽는다 — 열이 없거나 이름이 다르면 그 칸만 기본값으로 폴백하므로
# 앱은 멀쩡히 뜨지만 원고가 통째로 반영되지 않는다. 그래서 경고로 잡는다.
ANGEL_TEXT_COLS = [
    "ACCEPT_TITLE", "ACCEPT_DETAIL", "ACCEPT_AFTER",
    "REAPPRAISAL_TITLE", "REAPPRAISAL_DETAIL", "REAPPRAISAL_AFTER",
    "REFOCUS_TITLE", "REFOCUS_DETAIL", "REFOCUS_AFTER",
]
ANGEL_REASON_COLS = ["HELPFUL_1", "HELPFUL_2", "HELPFUL_3", "UNHELPFUL_1", "UNHELPFUL_2", "UNHELPFUL_3"]


def validate_angels_df(df):
    """요정 조언 CSV 검증. 반환: (치명적 오류 목록, 경고 목록)

    다른 두 시나리오 CSV와 조인 키가 다르다 — 여기는 DOMAIN('일상1') 하나뿐이고
    NO는 사람이 읽는 참고 열이다(파서 주석). REACTION_TYPE도 없다: 요정 조언은
    반응 기제 버전과 무관한 **에피소드 단위** 원고이기 때문이다.
    """
    errors = []
    warnings = []

    if "DOMAIN" not in df.columns:
        errors.append("필수 열이 없습니다: DOMAIN — 에피소드 조인 키입니다.")
        return errors, warnings

    domains = df["DOMAIN"].astype(str).str.strip()

    blank_count = int((domains == "").sum())
    if blank_count:
        errors.append(f"DOMAIN이 빈 행이 {blank_count}개 있습니다. 조인할 에피소드를 특정할 수 없습니다.")

    duplicated = sorted(domains[domains.duplicated() & (domains != "")].unique())
    if duplicated:
        errors.append(
            f"DOMAIN이 중복됩니다: {', '.join(duplicated[:5])} — "
            "조인이 맵이라 뒤 행이 앞 행을 조용히 덮어씁니다."
        )

    missing_text = [c for c in ANGEL_TEXT_COLS if c not in df.columns]
    if missing_text:
        warnings.append(
            f"요정 원고 열이 없습니다: {', '.join(missing_text)} — "
            "해당 칸은 앱에서 기본 문구로 폴백합니다."
        )

    if all(c not in df.columns for c in ANGEL_REASON_COLS):
        warnings.append("선택지 열(HELPFUL_*/UNHELPFUL_*)이 하나도 없습니다. 전 회차가 기본 선택지를 씁니다.")

    return errors, warnings


# 에필로그 CSV(scenario_epilogue.csv)의 계약.
#
# 다른 세 CSV와 축이 하나씩 다르다: REACTION_TYPE이 없고, DOMAIN에 회차 번호가
# 붙지 않으며('직장1'이 아니라 '직장'), 씬 하나가 한 행이다. 그래서 조인 키가
# (DOMAIN, SCENE_NUM) 두 열이다.
#
# **씬 수는 영역마다 다르다(4~8).** 4씬 고정이던 원고가 성숙한 대처를 보여 준
# 자리에서 그대로 끝나 "뚝 끊긴다"는 검수를 받아, 시간이 조금 흐른 뒤의 매듭
# 장면을 영역마다 필요한 만큼 붙였다(2026-08-26). 같은 날 극 밖 화자의 마무리
# 씬이 영역마다 한 장씩 더 붙어 상한을 8로 올렸다. 프론트 파서
# (scenarioEpilogueCsvParser.ts)의 EPILOGUE_SCENE_MIN/MAX와 같은 값이며,
# 한쪽만 고치면 어드민이 통과시킨 CSV를 앱이 조용히 버린다.
EPILOGUE_DOMAINS = ("직장", "취업준비", "연인", "일상")
EPILOGUE_SCENE_MIN = 4
EPILOGUE_SCENE_MAX = 8

#: 없으면 화면이 비는 열. 프론트 파서는 예외를 던지지 않고 빈 값으로 떨어뜨리므로
#: 여기서 막지 않으면 "에필로그는 열리는데 아무 글자도 없는" 상태가 배포된다.
EPILOGUE_REQUIRED_COLS = ["DOMAIN", "SCENE_NUM", "TITLE", "BG", "TEXT"]
EPILOGUE_CHAR_COLS = ["CHAR_1", "CHAR_2", "CHAR_3"]

#: 씬의 종류를 적는 **선택 열**(2026-08-26). 빈칸이면 극 안의 장면이고,
#: `narration`이면 극 밖 화자가 무엇이 달라졌는지 해설하는 마무리 씬이다 —
#: 앱이 그 씬만 가운데·이탤릭으로 갈라 그린다.
#:
#: 열이 없어도 통과시킨다. 프론트 파서가 없는 열·빈칸·모르는 값을 전부
#: 'scene'으로 떨어뜨리므로, 열을 더하기 전에 만든 CSV도 예전과 똑같이 돈다.
EPILOGUE_KIND_COL = "KIND"
EPILOGUE_KINDS = ("scene", "narration")


def validate_epilogue_df(df):
    """에필로그 CSV 검증. 반환: (치명적 오류 목록, 경고 목록)

    치명과 경고를 가르는 기준은 **앱에서 조용히 사라지는가**다.
      · 씬이 1번부터 4~6개로 이어지지 않은 영역은 파서가 그 영역을 통째로
        버린다 → 오류. (플레이어가 씬을 1번부터 순서대로 넘기는 구조라,
         3씬짜리나 번호가 빠진 영역을 살려 두면 카드가 해금된 채 중간에서
         끝나는 에필로그가 나온다.)
      · 영역 자체가 아예 없는 것은 "그 영역에는 아직 에필로그가 없다"는 정상
        상태다 → 경고. 원고를 한 영역씩 채워 올리는 작업을 막지 않는다.
      · 목록에 없는 DOMAIN은 어느 영역에도 붙지 않아 화면에 뜨지 않는다 → 경고.
    """
    errors = []
    warnings = []

    missing = [c for c in EPILOGUE_REQUIRED_COLS if c not in df.columns]
    if missing:
        errors.append(
            f"필수 열이 없습니다: {', '.join(missing)} — "
            "앱은 오류 없이 빈 값으로 떨어지므로 화면에서만 드러납니다."
        )
        return errors, warnings

    if all(c not in df.columns for c in EPILOGUE_CHAR_COLS):
        warnings.append(
            "인물 열(CHAR_1~3)이 하나도 없습니다. 배경만 있는 장면이 됩니다."
        )

    domains = df["DOMAIN"].astype(str).str.strip()
    scene_raw = df["SCENE_NUM"].astype(str).str.strip()

    blank_count = int((domains == "").sum())
    if blank_count:
        errors.append(f"DOMAIN이 빈 행이 {blank_count}개 있습니다. 조인할 영역을 특정할 수 없습니다.")

    scene_pattern = rf"[1-{EPILOGUE_SCENE_MAX}]"
    bad_scene = sorted(set(scene_raw[~scene_raw.str.fullmatch(scene_pattern, na=False)]))
    if bad_scene:
        errors.append(
            f"SCENE_NUM이 1~{EPILOGUE_SCENE_MAX}가 아닌 값이 있습니다: "
            f"{', '.join(repr(v) for v in bad_scene[:5])} — "
            "그 행은 앱에서 아무 오류 없이 사라집니다."
        )

    unknown = sorted(set(domains) - set(EPILOGUE_DOMAINS) - {""})
    if unknown:
        warnings.append(
            f"알 수 없는 DOMAIN이 있습니다: {', '.join(unknown[:5])} — "
            f"앱의 4영역({', '.join(EPILOGUE_DOMAINS)})에 붙지 않아 화면에 뜨지 않습니다."
        )

    # 영역별 씬 구성 검사. 위에서 걸러진 잘못된 SCENE_NUM은 여기서 다시 세지 않는다
    # (같은 사실을 두 번 말하게 된다).
    for domain in sorted(set(domains) - {""}):
        rows = scene_raw[domains == domain]
        nums = sorted(
            int(v) for v in rows if v.isdigit() and 1 <= int(v) <= EPILOGUE_SCENE_MAX
        )
        # 1번부터 결번 없이 이어지고 개수가 범위 안이면 통과. 개수만 맞고
        # 중간이 빈 경우(1,2,3,5)도 파서가 버리므로 여기서 함께 걸린다.
        if (
            EPILOGUE_SCENE_MIN <= len(nums) <= EPILOGUE_SCENE_MAX
            and nums == list(range(1, len(nums) + 1))
        ):
            continue
        errors.append(
            f"{domain}: 씬 번호가 {nums} 입니다 "
            f"(1번부터 빠짐없이 {EPILOGUE_SCENE_MIN}~{EPILOGUE_SCENE_MAX}개 필요) — "
            "앱은 이 영역의 에필로그를 통째로 버립니다."
        )

    # ── KIND(선택 열) ────────────────────────────────────────────────
    #
    # 둘 다 **경고**다. 이 함수가 치명과 경고를 가르는 기준은 위 docstring대로
    # "앱에서 조용히 사라지는가"인데, KIND가 잘못돼도 사라지는 것은 없다 —
    # 해설 씬이 평범한 장면처럼 보일 뿐이다. 오타 하나로 멀쩡한 원고 25행의
    # 업로드를 막는 쪽이 더 나쁘다.
    if EPILOGUE_KIND_COL in df.columns:
        kinds = df[EPILOGUE_KIND_COL].astype(str).str.strip().str.lower()
        bad_kind = sorted(set(kinds) - set(EPILOGUE_KINDS) - {"", "nan"})
        if bad_kind:
            warnings.append(
                f"{EPILOGUE_KIND_COL}에 모르는 값이 있습니다: "
                f"{', '.join(repr(v) for v in bad_kind[:5])} — "
                f"앱은 {', '.join(EPILOGUE_KINDS)}만 알아보고 나머지는 "
                "평범한 장면으로 그립니다(빈칸도 장면입니다)."
            )

        # 해설 씬은 배경만 남기기로 한 원고 규칙이다. 인물이 서 있으면 가운데·
        # 이탤릭으로 갈린 글씨가 캐릭터 위에 얹혀 눈에 띄게 어긋난다.
        char_cols = [c for c in EPILOGUE_CHAR_COLS if c in df.columns]
        if char_cols:
            has_char = (
                df[char_cols].astype(str).apply(lambda s: s.str.strip() != "").any(axis=1)
            )
            manned = int((has_char & (kinds == "narration")).sum())
            if manned:
                warnings.append(
                    f"{EPILOGUE_KIND_COL}가 narration인데 인물이 있는 행이 {manned}개 "
                    "있습니다 — 해설 씬은 배경만 두는 것이 원고 규칙입니다."
                )

    absent = [d for d in EPILOGUE_DOMAINS if d not in set(domains)]
    if absent:
        warnings.append(
            f"에필로그가 없는 영역이 있습니다: {', '.join(absent)} — "
            "그 영역의 목록에는 11번째 카드가 서지 않습니다."
        )

    row_min = len(EPILOGUE_DOMAINS) * EPILOGUE_SCENE_MIN
    row_max = len(EPILOGUE_DOMAINS) * EPILOGUE_SCENE_MAX
    if not row_min <= len(df) <= row_max:
        warnings.append(
            f"총 행 수가 {len(df)}개입니다 "
            f"({row_min}~{row_max}개 권장 — {len(EPILOGUE_DOMAINS)}영역 × "
            f"{EPILOGUE_SCENE_MIN}~{EPILOGUE_SCENE_MAX}씬)."
        )

    for col in ("TITLE", "BG", "TEXT"):
        empty = int((df[col].astype(str).str.strip() == "").sum())
        if empty:
            warnings.append(f"{col}이(가) 빈 칸이 {empty}개 있습니다.")

    return errors, warnings


def validate_questions_df(df, doc_id):
    """업로드 전 문항 검증. 반환: (치명적 오류 목록, 경고 목록)"""
    errors = []
    warnings = []

    required_cols = ["id", "part", "question", "type", "options"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        errors.append(f"필수 열이 없습니다: {', '.join(missing)}")
        return errors, warnings

    valid_types = {"scale", "yes-no", "multiple-choice"}
    invalid_types = df[~df["type"].astype(str).isin(valid_types)]["type"].astype(str).unique()
    if len(invalid_types) > 0:
        errors.append(f"지원하지 않는 type이 있습니다: {', '.join(invalid_types)}")

    yes_no_df = df[df["type"] == "yes-no"]
    for idx, row in yes_no_df.iterrows():
        opts = str(row["options"]).split(",")
        if not opts or opts[0].strip() != "예":
            warnings.append(f"문항 {row['id']}: yes-no 타입의 첫 번째 옵션이 '예'가 아닙니다.")

    if doc_id == "stress":
        valid_parts = {"인지", "정서", "행동"}
        invalid_parts = df[~df["part"].astype(str).isin(valid_parts)]["part"].astype(str).unique()
        if len(invalid_parts) > 0:
            errors.append(f"지원하지 않는 part가 있습니다: {', '.join(invalid_parts)}")
            
        for p in valid_parts:
            count = len(df[df["part"] == p])
            if count != 4:
                warnings.append(f"'{p}' 영역의 문항 수가 {count}개입니다 (4개 권장).")
                
        if len(df) != 12:
            warnings.append(f"스트레스 문항 총 개수가 {len(df)}개입니다 (12개 권장).")

    elif doc_id == "adhd":
        if len(df) != 6:
            warnings.append(f"ADHD 문항 총 개수가 {len(df)}개입니다 (6개 권장).")

    return errors, warnings
