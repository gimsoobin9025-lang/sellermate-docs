#!/usr/bin/env node

const clientId = process.env.GOOGLE_CLIENT_ID
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/oauth/callback'

if (!clientId) {
  console.error('Missing GOOGLE_CLIENT_ID')
  process.exit(1)
}

const scope = encodeURIComponent('https://www.googleapis.com/auth/blogger')
const state = encodeURIComponent('sellermate-blogger')
const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`

console.log(url)
