// src/utils/episodeSummary.ts
// 에피소드 목록 카드에 서는 줄거리 한 줄을 만든다.
//
// ─── 왜 순수 함수로 뺐나 (2026-08-27 UAT R2-08) ──────────────
//
// 예전에는 스토어(useScenarioStore.fetchThemes)가 첫 장면 내레이션을
// `text.slice(0, 40) + '...'`로 잘라 두고, 카드가 그 문자열을 다시 CSS
// `truncate`로 잘랐다. **한 문장이 두 번 잘린다.** 게다가 40자에서 끊긴
// 자리에 붙은 " ..."가 화면에서는 거의 항상 truncate에 먹혀 보이지도
// 않았고, 어쩌다 보이면 문장 중간에 말줄임이 두 겹으로 남았다
// (예: "…발표하고 있다. 발표 ...").
//
// 그래서 자르는 자리를 **문장 경계**로 옮겼다. 첫 종결(다./요././!/?)까지가
// 미리보기이고, 온전한 문장이므로 말줄임을 붙이지 않는다. 종결을 찾지
// 못할 때만 예전처럼 길이로 자르되 말줄임은 유니코드 한 글자('…')를 쓴다.
//
// full은 자르지 않은 원문이다 — 카드를 선택하면 그 자리에서 펼쳐 전문을
// 보여준다(R2-09). 상한을 두지 않는 것은 사용자 확정 사항이다.
//
// ⚠️ 닉네임 치환(백설 → 사용자 이름)은 **이 함수에 넣기 전에** 끝나 있어야
// 한다. 이름 길이가 사람마다 달라 치환 뒤에 잘라야 잘리는 자리가 맞는다.

/** 카드가 쓰는 두 벌. 접힌 카드는 preview, 펼친 카드는 full을 그린다. */
export interface EpisodeSummary {
  /** 첫 문장 (온전하면 말줄임 없음) */
  preview: string;
  /** 첫 장면 내레이션 전문 */
  full: string;
}

/** 문장 경계를 못 찾았을 때만 쓰는 길이 상한. 예전 슬라이스 폭을 그대로 물려받았다. */
export const SUMMARY_FALLBACK_LENGTH = 40;

/**
 * 첫 종결 부호. **뒤에 공백이나 문장 끝이 와야** 종결로 본다 —
 * 그래야 "발표 ..." 같은 말줄임의 첫 점이나 "…했다."이라고 처럼 부호 뒤에
 * 글자가 이어지는 자리에서 끊기지 않는다.
 */
const SENTENCE_END = /[.!?…。！？](?=\s|$)/;

/**
 * 첫 장면 내레이션에서 카드용 미리보기와 전문을 만든다.
 *
 * 빈 입력이면 두 값 모두 빈 문자열이다 — 호출부가 그때 줄 자체를 그리지
 * 않게 하기 위해서다(빈 자리에 '…'만 남는 카드를 만들지 않는다).
 */
export function buildEpisodeSummary(rawText: string | undefined | null): EpisodeSummary {
  const full = (rawText ?? '').trim();
  if (!full) return { preview: '', full: '' };

  const match = SENTENCE_END.exec(full);
  if (match) {
    return { preview: full.slice(0, match.index + match[0].length), full };
  }

  // 종결이 없는 원고(한 문장이 부호 없이 이어지는 경우)만 길이로 자른다.
  if (full.length <= SUMMARY_FALLBACK_LENGTH) return { preview: full, full };
  return { preview: `${full.slice(0, SUMMARY_FALLBACK_LENGTH)}…`, full };
}
