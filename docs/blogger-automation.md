# Blogger 자동 발행 세팅 (SellerMate)

## 1) 환경변수

`.env`에 아래 값 추가:

```env
BLOGGER_BLOG_ID=1263089068760040065
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/oauth/callback
GOOGLE_REFRESH_TOKEN=...
```

## 2) OAuth URL 생성 → 승인

```bash
node scripts/blogger-oauth-url.mjs
```

출력된 URL을 브라우저에서 열고 승인한 뒤,
리디렉션 URL의 `code=` 값을 복사.

## 3) code 교환으로 refresh token 확보

```bash
node scripts/blogger-oauth-exchange.mjs '<AUTH_CODE>'
```

출력된 `refresh_token`을 `.env`의 `GOOGLE_REFRESH_TOKEN`에 저장.

## 4) 발행 테스트

```bash
node scripts/blogger-publish.mjs --title "테스트 포스팅" --html "<p>자동 발행 테스트</p>"
```

정상 시 게시글 URL이 출력됨.

## 5) 매일 08:00 실행 (cron 예시)

```cron
0 8 * * * cd /Users/soobinkim/.openclaw/workspace/sellermate && /opt/homebrew/bin/node scripts/blogger-publish.mjs >> /Users/soobinkim/.openclaw/workspace/sellermate/logs/blogger-cron.log 2>&1
```

> 주의: 최초 자동화 전에는 수동 테스트 1회 필수.
