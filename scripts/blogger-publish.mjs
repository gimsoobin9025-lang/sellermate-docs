#!/usr/bin/env node

/**
 * SellerMate Blogger Publisher (MVP)
 *
 * Usage:
 *   node scripts/blogger-publish.mjs --title "..." --html "<p>..."
 *
 * Required env:
 *   BLOGGER_BLOG_ID
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 */

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN')
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return json.access_token
}

async function publishPost() {
  const blogId = process.env.BLOGGER_BLOG_ID
  if (!blogId) throw new Error('Missing BLOGGER_BLOG_ID')

  const title = arg('title', `초보 셀러를 위한 키워드 가이드 (${new Date().toISOString().slice(0, 10)})`)
  const html = arg(
    'html',
    '<p>셀러메이트 자동 포스팅 테스트입니다.</p><p>내일은 실제 콘텐츠 자동 발행으로 전환합니다.</p>'
  )
  const labels = arg('labels', '셀러메이트,초보셀러,키워드전략')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const accessToken = await getAccessToken()

  const payload = {
    kind: 'blogger#post',
    title,
    content: html,
    labels,
  }

  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Publish failed: ${res.status} ${text}`)
  }

  const out = await res.json()
  console.log(JSON.stringify({ ok: true, id: out.id, url: out.url, title: out.title }, null, 2))
}

publishPost().catch((err) => {
  console.error('[blogger-publish] error:', err.message)
  process.exit(1)
})
