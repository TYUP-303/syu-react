# Apple Silicon + pyarrow(mimalloc)의 알려진 세그폴트 회피.
#
# Streamlit AppTest가 st.dataframe을 Arrow로 직렬화할 때 mimalloc 풀이
# 프로세스 수명 후반 mi_thread_init에서 SIGSEGV를 낸다 — 테스트는 전부
# 통과한 뒤 종료 단계에서 터지므로 결과는 멀쩡한데 macOS 크래시 알림만
# 반복된다(2026-08-18 실측, 크래시 리포트 다수 + 원본 사본 대조로 기존
# 이슈임을 확인). Arrow가 공식 지원하는 이 스위치로 시스템 할당자를 쓰면
# 재현이 사라진다. pyarrow가 import되기 전에 걸려야 하므로 conftest
# 최상단, 어떤 import보다 먼저 둔다.
import os

os.environ.setdefault("ARROW_DEFAULT_MEMORY_POOL", "system")
