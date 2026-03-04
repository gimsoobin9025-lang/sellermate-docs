# RELEASE_CHECKLIST (App Store / Production)

## 1) Privacy policy
- [ ] `docs/privacy-policy.html` placeholder 치환 완료 (`PRIVACY_CONTACT_EMAIL`, `PRIVACY_CONTACT_NAME`)
- [ ] 공개 URL 준비 (예: GitHub Pages)
- [ ] 앱스토어 제출 정보에 privacy URL 입력

## 2) MCP endpoint / health
- [ ] 배포 endpoint 확인: `https://<host>/mcp`
- [ ] health 확인: `https://<host>/health` 응답 OK + version 일치
- [ ] `initialize` / `tools/list` / `tools/call` 회귀 검증 완료

## 3) Auth / OAuth 판단
- [ ] 공개 배포에 인증이 필요한지 결정
- [ ] 필요 시 provider/scopes/token storage/revocation/callback URL 확정
- [ ] Threat model 업데이트 (token leak, CSRF, redirect abuse)

## 4) Logging / security
- [ ] API key/원문 프롬프트 로그 미노출 재확인
- [ ] 에러/timeout/fallback 로그 동작 확인
- [ ] runtime recycle 정책(`MCP_RUNTIME_RECYCLE_MS`) 운영값 확정

## 5) Test gate
- [ ] `npm test` 통과
- [ ] `npm run dev` 기동 확인
- [ ] 기본 curl 시나리오 통과

## 6) Final
- [ ] 변경사항 커밋/태그
- [ ] 배포 후 smoke test 재실행
