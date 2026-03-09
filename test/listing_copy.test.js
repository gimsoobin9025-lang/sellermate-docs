import test from 'node:test'
import assert from 'node:assert/strict'
import { runListingCopy } from '../src/tools/listing_copy.js'

const baseArgs = {
  product_name: '유아 식판 세트',
  selling_points: ['흡착 고정', '간편 세척', 'BPA-free'],
  target_audience: '육아 중인 부모',
  platform: 'smartstore',
  tone: '신뢰 중심',
  category: 'kids',
}

test('listing_copy own-product flow adds structured readiness outputs and machine-readable omissions', async () => {
  const out = await runListingCopy(baseArgs)

  assert.equal(out.selling_mode, 'own_product')
  assert.equal(Array.isArray(out.required_missing), true)
  assert.equal(Array.isArray(out.next_steps), true)
  assert.equal(Array.isArray(out.image_plan), true)
  assert.equal(Array.isArray(out.risk_flags), true)
  assert.equal(Array.isArray(out.required_checks), true)
  assert.equal(typeof out.localized_product_summary, 'string')
  assert.equal(typeof out.ready_to_upload, 'boolean')
  assert.equal(out.ready_to_upload, false)
  assert.match(JSON.stringify(out.required_missing), /product_details/)
  assert.match(JSON.stringify(out.required_missing), /age_range/)
  assert.match(JSON.stringify(out.required_missing), /safety_cert/)
  assert.equal(out.required_missing.some((item) => item.severity === 'critical'), true)
  assert.equal(out.next_steps[0].step, 1)
  assert.match(out.next_steps[0].action, /제목|Confirm title/i)
  assert.equal(out.image_plan[0].role, 'main_thumbnail')
  assert.equal(out.questions_for_seller.some((item) => item.field === 'source_marketplace'), false)
})

test('listing_copy becomes upload-ready when critical own-product requirements are supplied', async () => {
  const out = await runListingCopy({
    ...baseArgs,
    selling_mode: 'own_product',
    product_details: '적합 연령 6개월 이상, KC 안전 인증 완료, 구성품: 흡착 식판, 뚜껑, 스푼. 재질은 실리콘입니다.',
    image_analysis: '실리콘 식판 본체와 뚜껑, 스푼이 포함된 민트색 제품 사진',
    must_include_images: ['KC 인증서', '적합 연령 안내'],
  })

  assert.equal(out.selling_mode, 'own_product')
  assert.equal(out.ready_to_upload, true)
  assert.deepEqual(
    out.required_missing.filter((item) => item.severity === 'critical'),
    []
  )
  assert.equal(out.next_steps.some((item) => /업로드|upload/i.test(item.action)), true)
  assert.equal(out.image_plan.some((item) => item.must_show.includes('KC 인증서')), true)
})

test('listing_copy cross-border flow surfaces sourcing gaps, risk flags, and localized summary', async () => {
  const out = await runListingCopy({
    product_name: '휴대용 전동 블렌더',
    selling_points: ['USB-C 충전', '미니 사이즈', '여행용 휴대'],
    target_audience: '1인 가구와 여행자',
    platform: 'smartstore',
    tone: '실용적이고 명확하게',
    category: 'electronics',
    selling_mode: 'cross_border_sourcing',
    source_marketplace: 'Taobao',
    source_title: '便携式榨汁杯',
    source_description: 'USB充电，适合旅行携带',
  })

  assert.equal(out.selling_mode, 'cross_border_sourcing')
  assert.equal(out.ready_to_upload, false)
  assert.equal(out.required_missing.some((item) => item.field === 'source_specs' && item.severity === 'critical'), true)
  assert.equal(out.required_missing.some((item) => item.field === 'origin_country' && item.severity === 'critical'), true)
  assert.equal(out.risk_flags.includes('cross_border_source_needs_localization_review'), true)
  assert.equal(out.risk_flags.includes('import_labeling_check_required'), true)
  assert.equal(out.risk_flags.includes('electronics_certification_review_required'), true)
  assert.match(out.localized_product_summary, /Taobao|해외/)
  assert.equal(out.questions_for_seller.some((item) => item.field === 'source_marketplace'), true)
  assert.equal(out.questions_for_seller.some((item) => item.field === 'age_range'), false)
  assert.match(out.next_steps[0].action, /원상품 정보 해석|Interpret and normalize source product data/i)
  assert.equal(out.image_plan.some((item) => item.role === 'localized_summary'), true)
})

test('listing_copy auto-detects cross-border mode from source fields for backward compatibility', async () => {
  const out = await runListingCopy({
    product_name: 'Portable Blender',
    selling_points: ['USB-C charging', 'Compact design', 'Easy cleaning'],
    target_audience: 'travelers',
    platform: 'amazon',
    tone: 'clear and practical',
    category: 'electronics',
    source_marketplace: 'Taobao',
    source_url: 'https://example.com/source-product',
    source_language: 'zh-CN',
    source_title: '便携式榨汁机',
    source_specs: 'USB-C rechargeable portable blender, cup, lid, cable included.',
    source_price: '¥89',
    product_details: 'Key specs: USB-C rechargeable portable blender, cup, lid, cable included.',
    image_analysis: 'White portable blender with cup and USB-C port',
  })

  assert.equal(out.selling_mode, 'cross_border_sourcing')
  assert.equal(out.ready_to_upload, false)
  assert.equal(out.required_missing.some((item) => item.field === 'origin_country' && item.severity === 'critical'), true)
  assert.equal(out.next_steps.some((item) => /source|소스|원상품/i.test(item.action)), true)
  assert.equal(out.image_plan[0].notes.includes('pure white background'), true)
})
