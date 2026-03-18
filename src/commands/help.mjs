import { BOLD, color, FG, RESET } from '../ui/ansi.mjs';

const title = `${BOLD}${color(FG.BRIGHT_WHITE, 'ccw')}${RESET}`;
const dim = s => color(FG.BRIGHT_BLACK, s);

console.log(`
${title} — VS Code 터미널용 Claude Code 세션 CLI 대시보드

${BOLD}Usage:${RESET}
  ccw              인터랙티브 대시보드 (기본)
  ccw start        인터랙티브 대시보드
  ccw setup        훅 설치 및 디렉토리 생성
  ccw status       일회성 세션 목록 출력
  ccw sessions     세션 목록 JSON 출력
  ccw /sound       알림 사운드 설정 보기/변경
  ccw help         이 도움말 출력

${BOLD}Dashboard Keys:${RESET}
  ${color(FG.CYAN, '↑ ↓')}            세션 선택 (위아래 이동)
  ${color(FG.CYAN, 'enter')}          상세보기 ↔ 목록 전환
  ${color(FG.CYAN, 'r')}              새로고침 (데이터 리로드)
  ${color(FG.CYAN, 'R')}              재시작 (프로세스 전체 재실행)
  ${color(FG.CYAN, 'q')}  /  ${color(FG.CYAN, 'Ctrl+C')}   종료

${BOLD}Status Colors:${RESET}
  ${color(FG.YELLOW, 'working')}        Claude가 응답을 처리 중
  ${color(FG.GREEN, 'waiting')}        사용자 입력 대기 중
  ${color(FG.CYAN, 'notification')}   알림 수신됨
  ${color(FG.BRIGHT_BLACK, 'stale')}          10분 이상 비활성
  ${color(FG.RED, 'error')}          오류 발생

${BOLD}Session Data:${RESET}
  ~/.claude/dashboard/active/<sessionId>.json

${BOLD}Getting Started:${RESET}
  1. ${dim('ccw setup')}   # 훅 설치
  2. VS Code에서 Claude Code 실행
  3. ${dim('ccw start')}   # 대시보드 실행 (별도 탭)
`);
