import type { ThemeCategory } from '../../api/scenarioMockData';
import { themeColorsFor } from '../../constants/themeColors';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';

interface ThemeListViewProps {
  themes: ThemeCategory[];
  progress: ScenarioProgressMap;
  onSelectTheme: (themeId: string) => void;
}

export default function ThemeListView({ themes, progress, onSelectTheme }: ThemeListViewProps) {
  // 테마별 진행도 계산 함수 (0 ~ 100%)
  const calculateProgress = (theme: ThemeCategory) => {
    const total = theme.episodes.length;
    if (total === 0) return 0;
    
    const cleared = theme.episodes.filter(
      (ep) => progress[ep.id]?.cleared
    ).length;
    
    return Math.round((cleared / total) * 100);
  };



  return (
    <div className="w-full flex flex-col gap-5 py-2 animate-fadeIn">
      {/* ── 상단 헤더 — 스크롤러 최상단에 플러시로 sticky (2026-08-18 팀 회의) ──
          2뎁스(EpisodeListView)는 이미 고정돼 있어서, 이 화면만 흐르면 뎁스를
          오갈 때 제목이 튀어 보였다. 같은 문법으로 맞춘다.

          -mx-6: 부모 main의 px-6을 상쇄해 프레임 폭까지 확장.
          -mt-8: 위쪽 여백(HomePage 콘텐츠 래퍼 py-6 = 24px + 이 뷰 루트의
                 py-2 = 8px)을 정확히 상쇄해 정적 위치를 스크롤포트 상단(0)에
                 맞춘다. 딱 맞게 상쇄해야 sticky 보정이 0이 되어, 스크롤 0에서
                 아래 카드와 겹치지도 위에 틈이 남지도 않는다.
          pt-8: 상쇄한 32px을 안쪽 여백으로 그대로 되돌린다 — 고정 전과 제목
                위치가 픽셀 단위로 같아진다. (EpisodeListView는 여기서 py-4만
                되돌려 헤더를 16px 끌어올렸다. 그쪽은 뒤로가기 버튼이 있는
                내비 줄이라 얇은 편이 낫고, 이쪽은 화면의 첫 제목이라 원래
                여백을 지킨다. 값을 서로 복사하지 말 것.)

          space-y-1은 안쪽 블록에 남긴다. 페이드 엣지가 이 블록의 첫 자식인데,
          space-y는 `첫 자식이 아닌` 모든 자식에 margin-top을 거는 규칙이라
          여기에 두면 제목이 4px 밀린다 (엣지가 absolute라 눈에는 안 보이는
          채로 자리만 차지하는 셈). ── */}
      <div className="sticky top-0 z-20 -mt-8 -mx-6 px-6 pt-8 pb-3 bg-surface">
        {/* 페이드 엣지 — 고정 헤더 아래로 카드가 지나갈 때 뚝 끊기지 않고
            서서히 사라지게 하는 스크롤 어포던스 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-surface to-transparent"
        />
        <div className="space-y-1">
          <h2 className="text-[20px] font-bold text-on-surface font-headline">시나리오 영역 선택</h2>
          <p className="text-[13px] text-outline font-body leading-relaxed">
            훈련하고자 하는 마음 근육 영역을 선택해 주세요.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {themes.map((theme) => {
          const percent = calculateProgress(theme);
          const icon = theme.icon;
          // 영역 고유색 (2026-08-27 R2-10). 카드 면과 본문 글자는 그대로 두고
          // 아이콘 칸 · 완주율 숫자 · 하단 막대 셋만 이 색을 입는다.
          const colors = themeColorsFor(theme.id);

          // hover:scale-[1.01]은 걷어냈다. v2 모션 통일에서 hover는 색만 바꾸고
          // 크기는 건드리지 않는다 — 카드가 커지면 옆 카드와의 간격이 흔들려
          // 목록 전체가 술렁인다. 이 카드에는 이미 hover:border-primary-container/40이
          // 있어 반응이 사라지지 않는다. 누를 때의 active:scale-[0.99]는 남긴다 —
          // 홈의 여정 카드도 같은 문법을 쓰는, 눌림을 알리는 순간 피드백이다.
          return (
            <button
              key={theme.id}
              onClick={() => onSelectTheme(theme.id)}
              className="
                w-full text-left bento-card p-5
                transition-all duration-300
                hover:border-primary-container/40 active:scale-[0.99]
                flex items-center gap-4 cursor-pointer relative group
              "
            >
              {/* 테마 아이콘 */}
              <div className={`
                w-12 h-12 rounded-control
                ${colors.container} flex items-center justify-center
                border border-outline-variant/30 ${colors.accent}
                group-hover:border-primary/50 transition-all
              `}>
                <span className="material-symbols-outlined text-[26px]">
                  {icon}
                </span>
              </div>

              {/* 텍스트 정보 */}
              <div className="flex-1 min-w-0 pr-4 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-bold text-on-surface group-hover:text-primary transition-colors">
                    {theme.title}
                  </h3>
                  <span className={`text-[12px] font-medium ${colors.accent}`}>
                    {percent}% 완료
                  </span>
                </div>
                {/* 2줄까지 허용한다 (2026-08-27 UAT) — truncate 한 줄로는
                    "직장 생활에서 겪는 어려…"처럼 문장이 끝을 못 맺어
                    영역을 고르는 데 필요한 정보가 잘려 나갔다. 카드 높이는
                    내용에 맞게 늘어난다(고정 높이를 주지 않는다). 3줄 이상은
                    그대로 …로 접힌다 — 온전한 설명은 2뎁스 헤더가 맡는다. */}
                <p className="text-[12px] leading-[17px] text-outline line-clamp-2">
                  {theme.description}
                </p>
              </div>

              {/* 오른쪽 진입 화살표 */}
              <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors text-[20px]">
                chevron_right
              </span>

              {/* 하단 프로그레스 바 (NRQ-0056) */}
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-outline-variant/20 overflow-hidden">
                <div
                  className={`h-full ${colors.accentFill} transition-all duration-500 ease-out`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
