export const DISCLAIMERS = {
  ko: '면책: 본 결과는 전략 보조용 제안이며 실제 성과를 보장하지 않습니다. 검색량/매출/순위 등 실측 데이터는 공식 도구에서 반드시 재검증하세요.',
  en: 'Disclaimer: Results are strategic suggestions only and do not guarantee actual performance. Always verify metrics (search volume, sales, rankings) with official tools. | 면책: 본 결과는 전략 보조용 제안이며 실제 성과를 보장하지 않습니다.',
}

export function getDisclaimer(lang = 'ko') {
  return DISCLAIMERS[lang] || DISCLAIMERS.ko
}

export const DISCLAIMER = getDisclaimer('ko')
