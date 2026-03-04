import test from 'node:test'
import assert from 'node:assert/strict'
import {
  containsForbiddenWords,
  noFabricatedMetricsGuard,
  requireFields,
} from '../src/lib/validation.js'

test('requireFields throws when required field missing/empty', () => {
  assert.throws(
    () => requireFields({ product_name: 'x', tone: '' }, ['product_name', 'tone']),
    /입력 누락: tone/
  )
})

test('containsForbiddenWords returns unique hits only', () => {
  const text = '무료 무료 특가 이벤트'
  const out = containsForbiddenWords(text, ['무료', '특가', '무료'])
  assert.deepEqual(out.sort(), ['무료', '특가'])
})

test('guard output remains parse-safe for JSON tool payload', () => {
  const payload = {
    summary: '월간 검색량: 5000 및 재고 20개',
    detail: '일반 문장',
  }
  const raw = JSON.stringify(payload)
  const guarded = noFabricatedMetricsGuard(raw)

  assert.doesNotThrow(() => JSON.parse(guarded.text))
  const parsed = JSON.parse(guarded.text)
  assert.match(parsed.summary, /\[수치-삭제: 성과지표 추정 금지 정책\]/)
})
