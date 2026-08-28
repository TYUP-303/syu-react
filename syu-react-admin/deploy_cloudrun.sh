#!/usr/bin/env bash
#
# 어드민(Streamlit)을 Cloud Run에 배포한다. 2026-08-16에 손으로 친 gcloud 명령을
# 스크립트로 굳힌 것이며, 플래그는 그때와 **같다** (session-affinity·max-instances=1
# 같은 값은 Streamlit이 세션 상태를 메모리에 들고 있기 때문에 붙은 것이라 임의로
# 바꾸면 화면이 중간에 초기화된다).
#
# 손으로 치던 것을 스크립트로 옮긴 진짜 이유는 배포 전에 해야 할 일이 하나
# 늘었기 때문이다 — legal.ts 스냅샷 동봉(아래 1단계). 잊으면 어드민의
# "코드 기본값 대비" 드리프트 표가 컨테이너에서 조용히 접힌다.
#
# 사용법:
#   ./deploy_cloudrun.sh                          # 기본 계정으로 배포
#   ./deploy_cloudrun.sh --account other@x.com    # 계정만 바꿔서 배포
#   ./deploy_cloudrun.sh --no-traffic             # 그 밖의 인자는 gcloud로 그대로 넘어감
#
# 주의: 이 스크립트는 배포만 한다. Firestore 데이터나 Secret Manager의 값은
# 건드리지 않는다.

set -euo pipefail

# --source . 가 어드민 디렉터리를 가리켜야 하므로, 어디서 실행하든 자기 폴더로 옮긴다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 설정값 (2026-08-16 배포와 동일) ───────────────────────────────
SERVICE="syu-react-admin"
PROJECT="syu-react"
REGION="asia-northeast3"
ACCOUNT="tyup303@gmail.com"

LEGAL_TS_SRC="../syu-react-frontend/src/constants/legal.ts"
SNAPSHOT_DIR="frontend_snapshot"

# ── 인자 처리 ─────────────────────────────────────────────────────
# --account만 이름으로 받아 기본값을 덮어쓰고, 나머지는 gcloud에 그대로 넘긴다.
# (--account를 그냥 통과시키면 gcloud에 같은 플래그가 두 번 실려 동작이 모호해진다.)
EXTRA_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --account)
      [ $# -ge 2 ] || { echo "오류: --account 뒤에 계정을 적으세요." >&2; exit 2; }
      ACCOUNT="$2"; shift 2 ;;
    --account=*)
      ACCOUNT="${1#--account=}"; shift ;;
    -h|--help)
      # 파일 머리의 사용법 주석을 그대로 보여 준다.
      sed -n '3,25p' "$0"; exit 0 ;;
    *)
      EXTRA_ARGS+=("$1"); shift ;;
  esac
done

# ── 1단계. legal.ts 스냅샷 동봉 ───────────────────────────────────
# 컨테이너에는 syu-react-admin/ 만 들어가서 ../syu-react-frontend/ 가 없다.
# 그래서 어드민의 드리프트 대조표가 읽을 사본을 여기 만들어 함께 올린다.
# settings_utils.load_legal_source()가 이 경로를 2순위로 본다.
#
# frontend_snapshot/ 은 생성물이라 커밋하지 않지만(루트 .gitignore),
# .gcloudignore·.dockerignore에서는 **일부러 제외하지 않았다** — 업로드되고
# 이미지에 복사되는 것이 목적이다. (gcloud는 .gcloudignore가 있으면 .gitignore를
# 참고하지 않으므로, 커밋 제외와 업로드 제외가 서로 간섭하지 않는다.)
if [ ! -f "$LEGAL_TS_SRC" ]; then
  echo "오류: $LEGAL_TS_SRC 를 찾을 수 없습니다." >&2
  echo "      저장소 전체가 체크아웃된 곳에서 실행해야 합니다 (프론트엔드 폴더가 형제로 있어야 함)." >&2
  exit 1
fi

mkdir -p "$SNAPSHOT_DIR"
cp "$LEGAL_TS_SRC" "$SNAPSHOT_DIR/legal.ts"

# 스냅샷 시각은 KST로 적는다 — 이 값은 어드민 화면에 그대로 표시되고, 보는 사람이
# 한국 시간으로 읽는다. UTC로 적으면 9시간 어긋난 채 "언제 것인가"를 판단하게 된다.
CAPTURED_AT="$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')"

# 커밋 해시. 저장소가 아니거나 git이 없을 수도 있으므로 실패를 삼킨다 —
# 해시를 못 구한 것 때문에 배포가 막힐 이유는 없다.
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '커밋 미상')"

# 스냅샷 뜨는 시점에 legal.ts가 커밋되지 않은 상태라면 해시만으로는 내용을
# 되찾을 수 없다. 그 사실을 해시에 붙여 밝힌다.
if ! git diff --quiet HEAD -- "$LEGAL_TS_SRC" 2>/dev/null; then
  COMMIT="${COMMIT}-dirty"
fi

# settings_utils.parse_snapshot_meta()가 읽는 key=value 형식.
cat > "$SNAPSHOT_DIR/META" <<EOF
# deploy_cloudrun.sh가 배포할 때마다 새로 씁니다. 손으로 고치지 마세요.
capturedAt=$CAPTURED_AT
commit=$COMMIT
source=$LEGAL_TS_SRC
EOF

echo "▶ legal.ts 스냅샷 준비 완료 — $CAPTURED_AT ($COMMIT)"

# ── 2단계. 배포 ───────────────────────────────────────────────────
echo "▶ Cloud Run 배포 시작 — $SERVICE ($REGION) / 계정 $ACCOUNT"

# set -e 아래에서는 실패 즉시 죽어 버려 종료 코드를 손에 쥘 수 없다.
# 성공·실패 모두 한 줄로 정리해 주려고 잠시 끈다.
set +e
gcloud run deploy "$SERVICE" \
  --source . \
  --project="$PROJECT" \
  --account="$ACCOUNT" \
  --region="$REGION" \
  --port=8501 \
  --session-affinity \
  --timeout=3600 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1 \
  --allow-unauthenticated \
  --set-secrets=/app/.streamlit/secrets.toml=admin-secrets-toml:latest,ADMIN_PASSWORD=admin-password:latest \
  --quiet \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  echo "✅ 배포 성공. 어드민의 [약관·공지 관리 → 운영 정보]에서 '스냅샷 기준: $CAPTURED_AT ($COMMIT)'이"
  echo "   보이면 스냅샷까지 제대로 실린 것입니다."
else
  echo "❌ 배포 실패 (gcloud 종료 코드 $STATUS). 위 로그를 확인하세요." >&2
fi

exit "$STATUS"
