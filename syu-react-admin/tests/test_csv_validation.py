# tests/test_csv_validation.py
# CSV 업로드 검증 로직의 "현재 동작"을 고정하는 특성화 테스트.
import pandas as pd
from csv_validation import (
    ANGEL_TEXT_COLS,
    EPILOGUE_CHAR_COLS,
    EPILOGUE_DOMAINS,
    EPILOGUE_SCENE_MAX,
    EPILOGUE_SCENE_MIN,
    build_join_keys,
    validate_angels_df,
    validate_epilogue_df,
    validate_scenario_df,
    validate_questions_df,
)


def make_dialogue_df(scene_nums=(1, 2, 3, 4), no="1", domain="D", reaction="R"):
    """에피소드 1개짜리 dialogue DataFrame. 열 수는 min_cols 검사를 넘도록 6개."""
    rows = [
        {"NO": no, "DOMAIN": domain, "REACTION_TYPE": reaction,
         "SCENE_NUM": s, "LINE": f"대사{s}", "EXTRA": ""}
        for s in scene_nums
    ]
    return pd.DataFrame(rows)


class TestBuildJoinKeys:
    def test_공백을_제거하고_언더스코어로_잇는다(self):
        df = pd.DataFrame({"NO": [" 1 "], "DOMAIN": ["학업 "], "REACTION_TYPE": [" 회피"]})
        assert build_join_keys(df).tolist() == ["1_학업_회피"]


class TestValidateScenarioDf:
    def test_정상_데이터는_오류와_경고가_없다(self):
        errors, warnings = validate_scenario_df(make_dialogue_df(), "dialogue", min_cols=5)
        assert errors == []
        assert warnings == []

    def test_열_부족은_치명적_오류다(self):
        df = pd.DataFrame({"NO": ["1"], "DOMAIN": ["D"]})
        errors, _ = validate_scenario_df(df, "dialogue", min_cols=5)
        assert any("열이" in e for e in errors)

    def test_필수_열_누락은_치명적_오류고_추가_검사를_중단한다(self):
        df = pd.DataFrame({"NO": ["1"], "DOMAIN": ["D"], "A": [""], "B": [""], "C": [""]})
        errors, warnings = validate_scenario_df(df, "dialogue", min_cols=5)
        assert any("REACTION_TYPE" in e for e in errors)
        assert warnings == []

    def test_키_값의_언더스코어는_치명적_오류다(self):
        df = make_dialogue_df(domain="학업_스트레스")
        errors, _ = validate_scenario_df(df, "dialogue", min_cols=5)
        assert any("언더스코어" in e for e in errors)

    def test_씬_결번은_경고다(self):
        errors, warnings = validate_scenario_df(
            make_dialogue_df(scene_nums=(1, 2, 4)), "dialogue", min_cols=5
        )
        assert errors == []
        assert len(warnings) == 1

    def test_씬_번호에_숫자가_아닌_값은_치명적_오류다(self):
        errors, _ = validate_scenario_df(
            make_dialogue_df(scene_nums=(1, 2, 3, "넷")), "dialogue", min_cols=5
        )
        assert any("SCENE_NUM" in e for e in errors)

    def test_visual_문서는_씬_검사를_건너뛴다(self):
        errors, warnings = validate_scenario_df(
            make_dialogue_df(scene_nums=(1, 2)), "visual", min_cols=5
        )
        assert errors == []
        assert warnings == []

def make_angels_df(domains=("직장1", "직장2"), drop_cols=()):
    """요정 조언 CSV 표본. 조인 키는 DOMAIN 하나뿐이다(REACTION_TYPE이 없다)."""
    rows = []
    for i, domain in enumerate(domains, start=1):
        row = {"NO": str(i), "DOMAIN": domain}
        row.update({col: f"{col}-{i}" for col in ANGEL_TEXT_COLS})
        row.update({f"HELPFUL_{n}": f"도움{n}" for n in (1, 2, 3)})
        row.update({f"UNHELPFUL_{n}": f"비도움{n}" for n in (1, 2, 3)})
        rows.append(row)
    df = pd.DataFrame(rows)
    return df.drop(columns=list(drop_cols))


class TestValidateAngelsDf:
    def test_정상_데이터는_오류와_경고가_없다(self):
        errors, warnings = validate_angels_df(make_angels_df())
        assert errors == []
        assert warnings == []

    def test_DOMAIN_열이_없으면_치명적_오류다(self):
        errors, _ = validate_angels_df(make_angels_df(drop_cols=["DOMAIN"]))
        assert any("DOMAIN" in e for e in errors)

    def test_DOMAIN_중복은_치명적_오류다(self):
        # 조인이 맵이라 뒤 행이 앞 행을 조용히 덮어쓴다.
        errors, _ = validate_angels_df(make_angels_df(domains=("일상1", "일상1")))
        assert any("중복" in e for e in errors)

    def test_DOMAIN이_빈_행은_치명적_오류다(self):
        errors, _ = validate_angels_df(make_angels_df(domains=("일상1", "")))
        assert any("빈 행" in e for e in errors)

    def test_원고_열_누락은_경고다(self):
        # 앱은 그 칸만 기본 문구로 폴백하므로 화면은 멀쩡하다 — 그래서 경고다.
        _, warnings = validate_angels_df(make_angels_df(drop_cols=["ACCEPT_DETAIL"]))
        assert any("ACCEPT_DETAIL" in w for w in warnings)

    def test_선택지_열이_전부_없으면_경고다(self):
        reason_cols = [f"HELPFUL_{n}" for n in (1, 2, 3)] + [f"UNHELPFUL_{n}" for n in (1, 2, 3)]
        _, warnings = validate_angels_df(make_angels_df(drop_cols=reason_cols))
        assert any("선택지" in w for w in warnings)

    def test_REACTION_TYPE이_없어도_통과한다(self):
        # 다른 두 시나리오 CSV의 검증기를 그대로 쓰면 여기서 치명적 오류가 난다.
        errors, _ = validate_angels_df(make_angels_df())
        assert errors == []


class TestValidateQuestionsDf:
    def test_정상_스트레스_데이터는_오류와_경고가_없다(self):
        rows = []
        for p in ["인지", "정서", "행동"]:
            for i in range(4):
                rows.append({"id": f"{p}{i}", "part": p, "question": "Q", "type": "yes-no", "options": "예,아니요"})
        df = pd.DataFrame(rows)
        errors, warnings = validate_questions_df(df, "stress")
        assert errors == []
        assert warnings == []

    def test_지원하지_않는_타입은_오류(self):
        df = pd.DataFrame({"id": ["1"], "part": ["인지"], "question": ["Q"], "type": "invalid-type", "options": "예,아니요"})
        errors, _ = validate_questions_df(df, "stress")
        assert any("지원하지 않는 type" in e for e in errors)

    def test_스트레스_잘못된_part는_오류(self):
        df = pd.DataFrame({"id": ["1"], "part": ["잘못된파트"], "question": ["Q"], "type": "yes-no", "options": "예,아니요"})
        errors, _ = validate_questions_df(df, "stress")
        assert any("지원하지 않는 part" in e for e in errors)

    def test_영역별_문항수_경고(self):
        df = pd.DataFrame({"id": ["1"], "part": ["인지"], "question": ["Q"], "type": "yes-no", "options": "예,아니요"})
        _, warnings = validate_questions_df(df, "stress")
        assert any("4개 권장" in w for w in warnings)
        assert any("12개 권장" in w for w in warnings)

    def test_yes_no_첫번째_옵션_경고(self):
        df = pd.DataFrame({"id": ["1"], "part": ["인지"], "question": ["Q"], "type": "yes-no", "options": "아니요,예"})
        _, warnings = validate_questions_df(df, "stress")
        assert any("'예'가 아닙니다" in w for w in warnings)

    def test_adhd_문항수_경고(self):
        df = pd.DataFrame({"id": ["1"], "part": ["A"], "question": ["Q"], "type": "scale", "options": "1,2,3"})
        _, warnings = validate_questions_df(df, "adhd")
        assert any("6개 권장" in w for w in warnings)


# ── 에필로그 ──────────────────────────────────────────────────
#
# 치명과 경고를 가르는 기준은 "앱에서 조용히 사라지는가"다. 씬이 1번부터
# 4~6개로 이어지지 않은 영역은 프론트 파서가 통째로 버리므로 업로드를 막고,
# 영역이 아예 없는 것은 "아직 원고가 없다"는 정상 상태라 통과시킨다.
#
# 씬 수가 고정이 아니라 범위인 이유는 csv_validation.EPILOGUE_SCENE_MIN/MAX의
# 주석에 있다 — 영역마다 매듭 장면의 길이가 다르다.


def make_epilogue_df(domains=EPILOGUE_DOMAINS, scene_nums=(1, 2, 3, 4)):
    """영역마다 scene_nums가 갖춰진 DataFrame. pandas 왕복과 같게 값은 모두 문자열."""
    rows = [
        {
            "DOMAIN": d,
            "SCENE_NUM": str(n),
            "TITLE": f"{d} 에필로그",
            "BG": "office.png",
            "CHAR_1": "",
            "CHAR_2": "baeksul_f_default.png",
            "CHAR_3": "",
            "TEXT": f"{d} {n}번째 장면",
        }
        for d in domains
        for n in scene_nums
    ]
    return pd.DataFrame(rows)


class TestValidateEpilogueDf:
    def test_정상_데이터는_오류와_경고가_없다(self):
        errors, warnings = validate_epilogue_df(make_epilogue_df())
        assert errors == []
        assert warnings == []

    def test_필수_열_누락은_치명적_오류고_추가_검사를_중단한다(self):
        df = make_epilogue_df().drop(columns=["TEXT"])
        errors, warnings = validate_epilogue_df(df)
        assert any("TEXT" in e for e in errors)
        assert warnings == []

    def test_5씬_6씬_영역도_정상이다(self):
        df = pd.concat(
            [
                make_epilogue_df(domains=("직장", "일상"), scene_nums=(1, 2, 3, 4, 5)),
                make_epilogue_df(
                    domains=("취업준비", "연인"), scene_nums=(1, 2, 3, 4, 5, 6)
                ),
            ],
            ignore_index=True,
        )
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert warnings == []

    def test_씬이_모자란_영역은_치명적_오류다(self):
        df = make_epilogue_df()
        # '직장'의 4번째 씬만 지운다 — 파서가 이 영역을 통째로 버리는 경우다.
        df = df[~((df["DOMAIN"] == "직장") & (df["SCENE_NUM"] == "4"))]
        errors, _ = validate_epilogue_df(df)
        assert any(
            "직장" in e and f"{EPILOGUE_SCENE_MIN}~{EPILOGUE_SCENE_MAX}" in e
            for e in errors
        )

    def test_씬_번호에_결번이_있으면_치명적_오류다(self):
        # 개수(4개)는 맞지만 4번이 비고 5번이 있다 — 파서도 이 영역을 버린다.
        df = make_epilogue_df(domains=("직장",), scene_nums=(1, 2, 3, 5))
        errors, _ = validate_epilogue_df(df)
        assert any("직장" in e and "[1, 2, 3, 5]" in e for e in errors)

    def test_씬이_최대_수를_넘으면_치명적_오류다(self):
        df = make_epilogue_df(
            domains=("직장",), scene_nums=tuple(range(1, EPILOGUE_SCENE_MAX + 2))
        )
        errors, _ = validate_epilogue_df(df)
        assert any("SCENE_NUM" in e for e in errors)

    def test_SCENE_NUM이_범위_밖이면_치명적_오류다(self):
        df = make_epilogue_df()
        df.loc[df.index[0], "SCENE_NUM"] = str(EPILOGUE_SCENE_MAX + 1)
        errors, _ = validate_epilogue_df(df)
        assert any("SCENE_NUM" in e for e in errors)

    def test_SCENE_NUM이_숫자가_아니어도_치명적_오류다(self):
        df = make_epilogue_df()
        df.loc[df.index[0], "SCENE_NUM"] = "넷"
        errors, _ = validate_epilogue_df(df)
        assert any("SCENE_NUM" in e for e in errors)

    def test_영역이_통째로_빠진_것은_경고에_그친다(self):
        df = make_epilogue_df(domains=("직장", "일상"))
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert any("취업준비" in w and "연인" in w for w in warnings)

    def test_알_수_없는_DOMAIN은_경고다(self):
        df = make_epilogue_df(domains=(*EPILOGUE_DOMAINS, "학업"))
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert any("학업" in w for w in warnings)

    def test_빈_TEXT는_경고로_잡는다(self):
        df = make_epilogue_df()
        df.loc[df.index[0], "TEXT"] = "  "
        _, warnings = validate_epilogue_df(df)
        assert any("TEXT" in w for w in warnings)


# KIND는 **선택 열**이다(2026-08-26). 극 안의 장면과 극 밖 화자의 마무리를
# 가르며, 앱이 후자만 가운데·이탤릭으로 그린다.
#
# 여기서 지키려는 것은 "열을 더해도 예전 CSV가 그대로 돈다"와 "잘못 써도
# 업로드를 막지는 않는다" 둘이다 — 파서가 모르는 값을 조용히 장면으로
# 떨어뜨리므로 사라지는 것이 없고, 그래서 전부 경고에 그친다.
class TestValidateEpilogueKind:
    def _with_kind(self, df, kind_by_scene):
        """SCENE_NUM → KIND 매핑으로 KIND 열을 붙인다."""
        df = df.copy()
        df["KIND"] = df["SCENE_NUM"].map(lambda n: kind_by_scene.get(n, ""))
        return df

    def test_KIND_열이_없어도_정상이다(self):
        df = make_epilogue_df()
        assert "KIND" not in df.columns
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert warnings == []

    def test_마지막_씬만_narration인_정상_원고는_통과한다(self):
        df = self._with_kind(make_epilogue_df(), {"4": "narration"})
        # 해설 씬은 배경만 둔다.
        df.loc[df["KIND"] == "narration", ["CHAR_1", "CHAR_2", "CHAR_3"]] = ""
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert warnings == []

    def test_모르는_KIND는_경고에_그친다(self):
        df = self._with_kind(make_epilogue_df(), {"4": "narratoin"})
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert any("KIND" in w and "narratoin" in w for w in warnings)

    def test_대소문자와_공백은_흡수한다(self):
        df = self._with_kind(make_epilogue_df(), {"4": "  NARRATION "})
        df.loc[df["KIND"].str.strip().str.lower() == "narration", EPILOGUE_CHAR_COLS] = ""
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert warnings == []

    def test_해설_씬에_인물이_서_있으면_경고다(self):
        # CHAR_2가 채워진 채로 narration을 붙인다 — 원고 규칙 위반이다.
        df = self._with_kind(make_epilogue_df(), {"4": "narration"})
        errors, warnings = validate_epilogue_df(df)
        assert errors == []
        assert any("narration" in w and "인물" in w for w in warnings)
