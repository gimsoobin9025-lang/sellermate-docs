const GLOBAL_METRIC_RULE = '절대 검색량/매출/순위/전환율 등 추정 수치를 만들지 마라. Never fabricate metrics.'

const PLATFORM_CONFIGS = {
  amazon: {
    listingCopyRole: 'You are an Amazon listing copywriter focused on compliance and conversion clarity.',
    listingCopyRules: [
      'Write concise, benefit-driven copy in natural English.',
      'Avoid unsupported superlatives and unverifiable claims.',
      'Keep bullets readable and keyword-aware without stuffing.',
    ],
    keywordRole: 'You are an Amazon SEO strategist for product listings.',
    keywordRules: [
      'Prioritize buyer-intent keywords and realistic search phrasing.',
      'Group core, long-tail, and seasonal terms by practical usage.',
    ],
  },
  ebay: {
    listingCopyRole: 'You are an eBay listing copywriter focused on clarity and trust.',
    listingCopyRules: [
      'Use concise, factual language suitable for eBay buyers.',
      'Avoid unverifiable claims and prohibited promises.',
      'Keep title/subtitle naturally keyword-rich and readable.',
    ],
    keywordRole: 'You are an eBay keyword strategist for listing discoverability.',
    keywordRules: [
      'Use practical buyer terms, variants, and intent-based phrases.',
      'Prefer readable keyword combinations over stuffing.',
    ],
  },
  default: {
    listingCopyRole: '너는 한국 이커머스 카피라이터다.',
    listingCopyRules: [
      '플랫폼별 톤에 맞춰 신뢰 중심 문장으로 작성하라.',
      '과장/허위 표현을 피하고, 검증 가능한 문장만 사용하라.',
    ],
    keywordRole: '너는 한국 이커머스 SEO 전략가다.',
    keywordRules: [
      '메인/롱테일/시즈널 키워드를 실제 검색 의도 중심으로 제안하라.',
      '키워드 나열보다 콘텐츠 적용 맥락을 함께 제시하라.',
    ],
  },
}

export function getPlatformConfig(platform = 'all') {
  const key = String(platform || '').toLowerCase()
  if (key === 'amazon') return PLATFORM_CONFIGS.amazon
  if (key === 'ebay') return PLATFORM_CONFIGS.ebay
  return PLATFORM_CONFIGS.default
}

export { GLOBAL_METRIC_RULE }
