import test from 'node:test'
import assert from 'node:assert/strict'
import { noFabricatedMetricsGuard } from '../src/lib/validation.js'

test('hard metric pattern is redacted: 월간 검색량: 5000', () => {
  const input = '이 키워드 월간 검색량: 5000 기준으로 작성'
  const out = noFabricatedMetricsGuard(input)

  assert.equal(out.policyViolation, true)
  assert.match(out.text, /\[수치-삭제: 성과지표 추정 금지 정책\]/)
})

test('hard speculative metric context is redacted', () => {
  const input = '이번 달 매출 예상 30000 수준입니다.'
  const out = noFabricatedMetricsGuard(input)

  assert.equal(out.policyViolation, true)
  assert.match(out.text, /\[수치-삭제: 성과지표 추정 금지 정책\]/)
})

test('generic numeric unit becomes warning only', () => {
  const input = '재고 약 20개 준비, 배송 3일 예상'
  const out = noFabricatedMetricsGuard(input)

  assert.equal(out.policyViolation, false)
  assert.deepEqual(out.warnings, ['soft_numeric_unit_detected'])
  assert.equal(out.text, input)
})
