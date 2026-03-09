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

test('listing_copy adds structured readiness outputs and machine-readable omissions', async () => {
  const out = await runListingCopy(baseArgs)

  assert.equal(Array.isArray(out.required_missing), true)
  assert.equal(Array.isArray(out.next_steps), true)
  assert.equal(Array.isArray(out.image_plan), true)
  assert.equal(typeof out.ready_to_upload, 'boolean')
  assert.equal(out.ready_to_upload, false)
  assert.match(JSON.stringify(out.required_missing), /product_details/)
  assert.match(JSON.stringify(out.required_missing), /age_range/)
  assert.match(JSON.stringify(out.required_missing), /safety_cert/)
  assert.equal(out.required_missing.some((item) => item.severity === 'critical'), true)
  assert.equal(out.next_steps[0].step, 1)
  assert.equal(out.image_plan[0].role, 'main_thumbnail')
})

test('listing_copy becomes upload-ready when critical requirements are supplied', async () => {
  const out = await runListingCopy({
    ...baseArgs,
    product_details: '적합 연령 6개월 이상, KC 안전 인증 완료, 구성품: 흡착 식판, 뚜껑, 스푼. 재질은 실리콘입니다.',
    image_analysis: '실리콘 식판 본체와 뚜껑, 스푼이 포함된 민트색 제품 사진',
    must_include_images: ['KC 인증서', '적합 연령 안내'],
  })

  assert.equal(out.ready_to_upload, true)
  assert.deepEqual(
    out.required_missing.filter((item) => item.severity === 'critical'),
    []
  )
  assert.equal(out.next_steps.some((item) => /업로드|upload/i.test(item.action)), true)
  assert.equal(out.image_plan.some((item) => item.must_show.includes('KC 인증서')), true)
})

test('listing_copy includes platform-aware requirements for imported amazon listings', async () => {
  const out = await runListingCopy({
    product_name: 'Portable Blender',
    selling_points: ['USB-C charging', 'Compact design', 'Easy cleaning'],
    target_audience: 'travelers',
    platform: 'amazon',
    tone: 'clear and practical',
    category: 'electronics',
    is_imported: true,
    product_details: 'Key specs: USB-C rechargeable portable blender, cup, lid, cable included.',
    image_analysis: 'White portable blender with cup and USB-C port',
  })

  assert.equal(out.ready_to_upload, false)
  assert.equal(out.required_missing.some((item) => item.field === 'origin_country' && item.severity === 'critical'), true)
  assert.equal(out.next_steps.some((item) => /backend|search/i.test(item.action)), true)
  assert.equal(out.image_plan[0].notes.includes('pure white background'), true)
})
