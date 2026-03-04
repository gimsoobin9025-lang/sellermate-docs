# SellerMate MCP

SellerMate는 이커머스 카피/키워드 전략 생성을 위한 MCP 서버입니다.

## 현재 상태 요약
- MCP 서버
  - `/mcp`(POST only), `/health`, `/docs/privacy-policy.html` 제공
  - `listing_copy`, `keyword_strategy` 두 도구 지원
- 안정성/운영
  - runtime 재사용 + 선택적 주기 recycle (`MCP_RUNTIME_RECYCLE_MS`)
  - LLM timeout/fallback 로깅 및 민감정보 비노출 정책 적용
  - shutdown 시 runtime close 에러를 transport/server 단위로 분리 로깅
- 정책/검증
  - 성과지표 추정 수치 guard(hard violation) + 일반 숫자 경고(warning) 분리
  - validation/guard 단위테스트 + 서버 `/health` 통합테스트 포함
- 배포 준비
  - privacy policy 문서 + 템플릿/치환 가이드
  - 릴리즈 체크리스트(`RELEASE_CHECKLIST.md`) 포함

## 실행
```bash
cd /Users/soobinkim/.openclaw/workspace/sellermate
npm install
npm run dev
```

## 테스트
```bash
npm test
```

## Privacy Policy
- 로컬 경로: `docs/privacy-policy.html`
- 로컬 서빙 URL(개발 서버): `http://localhost:3000/docs/privacy-policy.html`
- 앱스토어 제출 전 `PRIVACY_CONTACT_EMAIL`, `PRIVACY_CONTACT_NAME` TODO 항목을 실제 운영 연락처로 교체 필수
- 배포(정적 호스팅): `docs/privacy-policy.html` 파일을 Vercel/Netlify/GitHub Pages/S3 같은 정적 호스팅에 업로드 후 공개 HTTPS URL을 앱스토어 제출 문서에 기입

## 운영 환경변수
- `LLM_TIMEOUT_MS` (기본: `15000`)
- `MCP_RUNTIME_RECYCLE_MS` (기본: `0`, 비활성)

## 배포 가이드
### A) GitHub Pages (Privacy 문서)
1. `docs/privacy-policy.html`을 Pages 대상 경로에 포함
2. `docs/privacy-policy.template.md` 가이드로 placeholder 치환
3. 공개 URL 예시: `https://<org>.github.io/<repo>/privacy-policy.html`

### B) Railway (MCP 서버)
1. Railway에 repo 연결 후 Deploy
2. Start command: `npm start`
3. 환경변수 설정(필요 시): `OPENAI_API_KEY`, `LLM_TIMEOUT_MS`, `MCP_RUNTIME_RECYCLE_MS`
4. 배포 URL 예시: `https://<service>.up.railway.app`

### 배포 후 검증 curl
```bash
BASE_URL="https://<service>.up.railway.app"

curl -sS "$BASE_URL/health"

curl -sS -D /tmp/mcp.h -o /tmp/mcp.init -X POST "$BASE_URL/mcp" \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'

SESSION_ID=$(awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/{print $2}' /tmp/mcp.h | tr -d '\r')
curl -sS -X POST "$BASE_URL/mcp" -H "mcp-session-id: $SESSION_ID" -H 'accept: application/json, text/event-stream' -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
curl -sS -X POST "$BASE_URL/mcp" -H "mcp-session-id: $SESSION_ID" -H 'accept: application/json, text/event-stream' -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"listing_copy","arguments":{"product_name":"무선 청소기","selling_points":["가벼움","저소음"],"target_audience":"1인 가구","platform":"smartstore","tone":"신뢰 중심"}}}'
```

## 로컬 검증 예시
```bash
# 1) initialize (세션 ID 확보)
curl -sS -D /tmp/mcp.h -o /tmp/mcp.init -X POST http://localhost:3000/mcp \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'

# 2) tools/list, tools/call
SESSION_ID=$(awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/{print $2}' /tmp/mcp.h | tr -d '\r')
curl -sS -X POST http://localhost:3000/mcp -H "mcp-session-id: $SESSION_ID" -H 'accept: application/json, text/event-stream' -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
curl -sS -X POST http://localhost:3000/mcp -H "mcp-session-id: $SESSION_ID" -H 'accept: application/json, text/event-stream' -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"listing_copy","arguments":{"product_name":"무선 청소기","selling_points":["가벼움","저소음"],"target_audience":"1인 가구","platform":"smartstore","tone":"신뢰 중심"}}}'
```