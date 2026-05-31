// ============================================================
//  STAGE 2: SCRIPT GENERATOR — Anthropic + OpenAI 혼용
//  비용 최적화: 숏폼=gpt-4o-mini, 롱폼=Claude or GPT-4o
//  실행: node stage2-script/script-generator.js
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');

// ── 시스템 프롬프트 (동일하게 양쪽 LLM에 사용) ──────────
const SYSTEM_PROMPT = `
당신은 "Brain After 50" 채널의 전문 콘텐츠 작가입니다.

【채널 정체성】
45~70세 대상 뇌 건강, 수면, 치매 예방 채널.
핵심: "공포심이 아닌 과학으로, 지금 당장 할 수 있는 것을 알려주는 채널"

【콘텐츠 3대 원칙 — 절대 준수】

1. 기승전결 구조
   기(起): 5초 안에 자극 훅 (숫자/반전/개인화 중 하나)
   승(承): 데이터로 문제 구체화 (논문 근거 명시)
   전(轉): 예상을 뒤엎는 반전 또는 과학 메커니즘
   결(結): 오늘 당장 실천 가능한 1~3가지 액션

2. 자극 요소 (반드시 1개 이상)
   A 숫자충격형 / B 상식반전형 / C 개인화위협형
   D 희망반전형 / E 비밀공개형

3. 신뢰 데이터
   모든 핵심 주장에 제공된 논문 데이터 인용 필수
   인용 형식: (저자, 연도, 저널명)
   마지막에 의학적 면책 문구 자연스럽게 포함

【금지】과장, 근거없는 주장, 의학 진단/처방, 논문에 없는 수치 창작
【출력】JSON만 출력, 다른 텍스트 없음
`.trim();

// ── Anthropic Claude 호출 ────────────────────────────────
async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.llm.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.llm.anthropic.model,
      max_tokens: config.llm.anthropic.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API 오류: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.content[0].text;
}

// ── OpenAI GPT 호출 ──────────────────────────────────────
async function callOpenAI(prompt, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.openai.apiKey}`,
    },
    body: JSON.stringify({
      model: model || config.llm.openai.modelShortform,
      max_tokens: config.llm.openai.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' }, // JSON 강제
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API 오류: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// ── 엔진 선택 + JSON 파싱 ─────────────────────────────────
async function generateScript(prompt, contentType = 'shortform') {
  let raw;

  // 비용 최적화 전략:
  // 숏폼 → gpt-4o-mini (가장 저렴, 숏폼은 품질 차이 적음)
  // 롱폼 → 기본 엔진 (Claude 또는 gpt-4o)
  const useEngine = contentType === 'shortform'
    ? 'openai_mini'
    : config.llm.default;

  try {
    if (useEngine === 'openai_mini') {
      raw = await callOpenAI(prompt, config.llm.openai.modelShortform);
      console.log(`    [GPT-4o-mini 사용]`);
    } else if (useEngine === 'openai') {
      raw = await callOpenAI(prompt, config.llm.openai.modelLongform);
      console.log(`    [GPT-4o 사용]`);
    } else {
      raw = await callClaude(prompt);
      console.log(`    [Claude 사용]`);
    }
  } catch (primaryErr) {
    // 폴백: 기본 엔진 실패 시 반대 엔진으로 재시도
    console.log(`    ⚠️  ${useEngine} 실패, 폴백 시도...`);
    try {
      raw = useEngine === 'openai_mini'
        ? await callClaude(prompt)
        : await callOpenAI(prompt, config.llm.openai.modelShortform);
    } catch (fallbackErr) {
      throw new Error(`양쪽 LLM 모두 실패: ${primaryErr.message} / ${fallbackErr.message}`);
    }
  }

  // JSON 파싱
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// ── 숏폼 프롬프트 ────────────────────────────────────────
function buildShortformPrompt(articles, pillar) {
  const articleData = articles.slice(0, 3).map((a, i) =>
    `[논문${i+1}] ${a.title} | ${a.authors}(${a.year}) | ${a.journal} | PMID:${a.pmid}`
  ).join('\n');

  return `논문 데이터:\n${articleData}\n\n콘텐츠 기둥: ${pillar}\n\n숏폼 스크립트 JSON 출력 (50초/130단어):\n{"type":"shortform","pillar":"${pillar}","stimulusType":"A~E중선택","hook":"첫5초훅","title":"YouTube제목40자이내","script":{"gi":"기5초","seung":"승15초","jeon":"전20초","gyeol":"결10초"},"fullScript":"전체나레이션","citations":[{"claim":"주장","source":"저자(연도).저널.PMID:xxxxx","pubmedUrl":"https://pubmed.ncbi.nlm.nih.gov/xxxxx/"}],"tags":["태그10개"],"description":"설명란200자","disclaimer":"면책문구"}`;
}

// ── 롱폼 프롬프트 ────────────────────────────────────────
function buildLongformPrompt(articles, pillar) {
  const articleData = articles.slice(0, 5).map((a, i) =>
    `[논문${i+1}] ${a.title} | ${a.authors}(${a.year}) | ${a.journal} | PMID:${a.pmid}`
  ).join('\n');

  return `논문 데이터:\n${articleData}\n\n콘텐츠 기둥: ${pillar}\n\n롱폼 스크립트 JSON (15분/2200단어):\n{"type":"longform","pillar":"${pillar}","stimulusType":"선택","hook":"오프닝훅","title":"YouTube제목50자","sections":{"gi":{"timestamp":"0:00-2:00","script":"...","screenNote":"화면연출"},"seung":{"timestamp":"2:00-7:00","script":"...","screenNote":"..."},"jeon":{"timestamp":"7:00-13:00","script":"...","screenNote":"..."},"gyeol":{"timestamp":"13:00-15:00","script":"...","screenNote":"..."}},"fullScript":"전체","citations":[{"claim":"주장","source":"출처","pubmedUrl":"url","timestamp":"등장시점"}],"chapters":[{"timestamp":"0:00","title":"챕터명"}],"tags":["태그15개"],"description":"설명500자","disclaimer":"면책문구","nextVideoTeaser":"다음편예고"}`;
}

// ── 메인 실행 ────────────────────────────────────────────
async function runScriptGeneration(researchData = null) {
  console.log('✍️  Stage 2: 스크립트 생성 시작\n');

  if (!researchData) {
    const dir = path.join(__dirname, '../output/research');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    if (!files.length) throw new Error('Stage 1 먼저 실행하세요');
    researchData = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  }

  const pillars = [
    { name: 'Pillar1_수면뇌',  keywords: ['sleep', 'glymphatic'] },
    { name: 'Pillar2_치매예방', keywords: ['dementia', 'alzheimer', 'cognitive'] },
    { name: 'Pillar3_뇌영양',  keywords: ['mediterranean', 'gut', 'omega'] },
    { name: 'Pillar4_뇌훈련',  keywords: ['cognitive training', 'bilingual'] },
  ];

  const results = [];
  const outputDir = path.join(__dirname, '../output/scripts');
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().split('T')[0];

  for (const pillar of pillars) {
    const articles = researchData.articles.filter(a =>
      pillar.keywords.some(kw =>
        a.title?.toLowerCase().includes(kw) || a.searchTerm?.toLowerCase().includes(kw)
      )
    );
    if (!articles.length) { console.log(`  ⚠️  ${pillar.name}: 논문 없음`); continue; }

    console.log(`  ${pillar.name} 숏폼 생성 중... (논문 ${articles.length}개)`);
    try {
      const script = await generateScript(buildShortformPrompt(articles, pillar.name), 'shortform');
      results.push(script);
      const fname = `${timestamp}-${pillar.name}-shortform.json`;
      fs.writeFileSync(path.join(outputDir, fname), JSON.stringify(script, null, 2));
      console.log(`    ✅ ${fname}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) { console.log(`    ❌ ${e.message}`); }
  }

  // 이번 주 롱폼
  const lp = pillars[Math.floor(Date.now() / (7*24*60*60*1000)) % pillars.length];
  const la = researchData.articles.filter(a =>
    lp.keywords.some(kw => a.title?.toLowerCase().includes(kw))
  );
  if (la.length >= 2) {
    console.log(`\n  ${lp.name} 롱폼 생성 중...`);
    try {
      const script = await generateScript(buildLongformPrompt(la, lp.name), 'longform');
      results.push(script);
      const fname = `${timestamp}-${lp.name}-longform.json`;
      fs.writeFileSync(path.join(outputDir, fname), JSON.stringify(script, null, 2));
      console.log(`    ✅ ${fname}`);
    } catch (e) { console.log(`    ❌ ${e.message}`); }
  }

  console.log(`\n✅ Stage 2 완료: ${results.length}개 스크립트`);
  return results;
}

if (require.main === module) runScriptGeneration().catch(console.error);
module.exports = { runScriptGeneration, generateScript };
