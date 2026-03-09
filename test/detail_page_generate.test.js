import test from 'node:test'
import assert from 'node:assert/strict'
import { runDetailPageGenerate } from '../src/tools/detail_page_generate.js'
import { getDetailPageHtmlConfig } from '../src/lib/platform-prompts.js'

const baseArgs = {
  product_name: '테스트 <b>상품</b>',
  platform: 'coupang',
  selling_points: ['강력한 <script>alert(1)</script> 세정력', '간편한 사용'],
  target_audience: '바쁜 <엄마>',
  category: 'food',
}

test('detail page fallback escapes user-derived HTML', async () => {
  const out = await runDetailPageGenerate({
    ...baseArgs,
    brand_name: '브랜드 & Co',
    highlight_phrases: ['특가 <img src=x onerror=alert(1)>'],
  })

  assert.match(out.detail_page_html, /테스트 &lt;b&gt;상품&lt;\/b&gt;/)
  assert.match(out.detail_page_html, /브랜드 &amp; Co/)
  assert.match(out.detail_page_html, /특가 &lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(out.detail_page_html, /<script>alert\(1\)<\/script>/)
  assert.doesNotMatch(out.detail_page_html, /<img src=x onerror=alert\(1\)>/)
})

test('detail page uses centralized platform width config', async () => {
  const out = await runDetailPageGenerate(baseArgs)
  const expectedWidth = getDetailPageHtmlConfig('coupang').containerWidth

  assert.match(out.detail_page_html, new RegExp(`max-width:${expectedWidth}`))
})

test('detail page fallback section copy reflects category meaning', async () => {
  const out = await runDetailPageGenerate(baseArgs)

  assert.match(out.detail_page_html, /맛, 향, 식감/)
  assert.match(out.detail_page_html, /원재료|성분/)
  assert.doesNotMatch(out.detail_page_html, /섹션 설명 영역입니다/)
})

test('detail page fabricated-metrics guard is scoped to text fields and preserves schema', async () => {
  const out = await runDetailPageGenerate({
    ...baseArgs,
    product_name: '검색량: 5000 클렌저',
    highlight_phrases: ['월간 검색량: 5000'],
  })

  assert.equal(Array.isArray(out.sections_summary), true)
  assert.equal(Array.isArray(out.image_placement_guide), true)
  assert.equal(typeof out.sections_summary[0].section_number, 'number')
  assert.equal(typeof out.image_placement_guide[0].section_number, 'number')
  assert.equal(typeof out.policy_violation, 'boolean')
  assert.match(out.detail_page_html, /\[수치-삭제: 성과지표 추정 금지 정책\]/)
})
