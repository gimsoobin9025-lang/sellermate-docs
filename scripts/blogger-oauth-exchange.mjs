#!/usr/bin/env node

const code = process.argv[2]
if (!code) {
  console.error('Usage: node scripts/blogger-oauth-exchange.mjs <AUTH_CODE>')
  process.exit(1)
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/oauth/callback'

if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET')
  process.exit(1)
}

const body = new URLSearchParams({
  code,
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: redirectUri,
  grant_type: 'authorization_code',
})

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
})

const text = await res.text()
if (!res.ok) {
  console.error('Exchange failed:', text)
  process.exit(1)
}

const json = JSON.parse(text)
console.log(JSON.stringify({ refresh_token: json.refresh_token, scope: json.scope }, null, 2))
