export const GLOBAL_METRIC_RULE =
  '절대 검색량/매출/순위/전환율 등 추정 수치를 만들지 마라. Never fabricate metrics.'

export const PLATFORM_CONFIGS = {
  smartstore: {
    locale: 'ko',
    listingCopyRole: '너는 네이버 스마트스토어 전문 카피라이터다.',
    listingCopyRules: [
      '상품명은 50자 이내, 핵심 키워드를 앞쪽에 배치하라.',
      '상세페이지 카피는 한국어 존댓말(~합니다, ~입니다) 기준으로 작성하라.',
      'SEO 태그는 네이버 검색 최적화 기준으로 작성하라.',
    ],
    keywordRole: '너는 네이버 스마트스토어 SEO 전략가다.',
    keywordRules: [
      '네이버 쇼핑 검색 알고리즘 특성을 고려하라.',
      '카테고리 키워드와 속성 키워드를 구분하라.',
    ],
    outputLanguage: 'ko',
  },
  coupang: {
    locale: 'ko',
    listingCopyRole: '너는 쿠팡 마켓플레이스 전문 카피라이터다.',
    listingCopyRules: [
      '상품명은 100자 이내로 키워드 밀도를 높여라.',
      '로켓배송/로켓와우 맥락을 고려한 카피를 작성하라.',
      '상세페이지는 모바일 우선으로 짧은 문단 중심.',
    ],
    keywordRole: '너는 쿠팡 SEO 전략가다.',
    keywordRules: ['쿠팡 검색 자동완성 및 연관 키워드 패턴을 고려하라.'],
    outputLanguage: 'ko',
  },
  '11st': {
    locale: 'ko',
    listingCopyRole: '너는 11번가 전문 카피라이터다.',
    listingCopyRules: ['11번가 상품명 가이드라인을 준수하라.', '셀러 등급 및 리뷰 중심 신뢰도 카피를 작성하라.'],
    keywordRole: '너는 11번가 SEO 전략가다.',
    keywordRules: [],
    outputLanguage: 'ko',
  },
  instagram: {
    locale: 'ko',
    listingCopyRole: '너는 인스타그램 커머스 전문 카피라이터다.',
    listingCopyRules: ['해시태그 중심 카피를 작성하라.', '캐주얼하고 감성적인 톤을 유지하라.', '이모지를 적절히 활용하라.'],
    keywordRole: '너는 인스타그램 커머스 마케팅 전략가다.',
    keywordRules: ['해시태그 전략 중심으로 키워드를 제안하라.'],
    outputLanguage: 'ko',
  },
  amazon: {
    locale: 'en',
    listingCopyRole: 'You are an Amazon marketplace listing copywriter.',
    listingCopyRules: [
      'Product title must be under 200 characters. Follow Amazon title formula: Brand + Model + Key Feature + Product Type + Size/Quantity.',
      'Generate exactly 5 bullet points. Each bullet starts with a capitalized benefit keyword.',
      'Write a product description paragraph (max 2000 characters) optimized for A9 search behavior.',
      'Backend search terms: suggest comma-separated terms not duplicated in title/bullets.',
      'Do not include price/promotion claims or subjective hype words against policy.',
      'All output must be in English.',
    ],
    keywordRole: 'You are an Amazon SEO and keyword strategist.',
    keywordRules: [
      'Prioritize keywords for Amazon A9/A10 search behavior.',
      'Separate frontend keyword usage (title/bullets) from backend search terms.',
      'Include long-tail keywords with purchase intent.',
      'All output must be in English.',
    ],
    outputLanguage: 'en',
  },
  ebay: {
    locale: 'en',
    listingCopyRole: 'You are an eBay marketplace listing copywriter.',
    listingCopyRules: [
      'Title must be max 80 characters and front-load important keywords.',
      'Subtitle should be max 55 characters when provided.',
      'Write item description in HTML-friendly prose.',
      'Suggest Item Specifics as key-value pairs.',
      'Avoid ALL CAPS, excessive punctuation, and spam-like language.',
      'All output must be in English.',
    ],
    keywordRole: 'You are an eBay SEO and keyword strategist.',
    keywordRules: [
      'Optimize for eBay Cassini search behavior.',
      'Item Specifics are critical for visibility and should be comprehensive.',
      'Include practical long-tail and condition-aware terms where relevant.',
      'All output must be in English.',
    ],
    outputLanguage: 'en',
  },
}

export const DEFAULT_CONFIG = PLATFORM_CONFIGS.smartstore

export function getPlatformConfig(platform = 'all') {
  const key = String(platform || 'all').toLowerCase()
  if (key === 'all') return DEFAULT_CONFIG
  return PLATFORM_CONFIGS[key] || DEFAULT_CONFIG
}
