# Privacy Policy Contact Template (Do not commit real secrets)

앱스토어 제출 전 `docs/privacy-policy.html`의 연락처 placeholder를 아래 값으로 치환하세요.

## Required variables
- `PRIVACY_CONTACT_EMAIL` = `your-real-privacy-email@example.com`
- `PRIVACY_CONTACT_NAME` = `Your Company or DPO Name`

## Safe replacement guide
1. 실제 운영 연락처를 내부 비밀 저장소(1Password, Vault, CI secret 등)에만 저장
2. `docs/privacy-policy.html`의 placeholder 문자열만 치환
3. 치환 후 문서 URL에서 실제 값이 노출되는지 확인
4. 민감정보(개인 휴대폰, 개인 주소)는 정책 문서에 하드코딩 금지

## Example (local only)
```bash
export PRIVACY_CONTACT_EMAIL="privacy@your-domain.com"
export PRIVACY_CONTACT_NAME="Your Company Privacy Team"

# macOS BSD sed
sed -i '' "s|PRIVACY_CONTACT_EMAIL|${PRIVACY_CONTACT_EMAIL}|g" docs/privacy-policy.html
sed -i '' "s|PRIVACY_CONTACT_NAME|${PRIVACY_CONTACT_NAME}|g" docs/privacy-policy.html
```

> 주의: 위 치환 결과를 그대로 커밋할지 여부는 조직 정책을 따르세요.
