// ============================================================
//  STAGE 2: SCRIPT GENERATOR (Claude API)
//  수집된 논문을 기반으로 콘텐츠 스크립트 자동 생성
//  기승전결 × 자극 × 신뢰 데이터 3원칙 적용
//  실행: node stage2-script/claude-script-generator.js
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ── 시스템 프롬프트 (채널 핵심 DNA) ─────────────────────
const SYSTEM_PROMPT = `
당신은 "Brain After 50" 채널의 전문 콘텐츠 작가입니다.

【채널 정체성】
- 45~70세 시청자 대상 뇌 건강, 수면, 치매 예방 채널
- 핵심 포지셔닝: "공포심이 아닌 과학으로, 지금 당장 할 수 있는 것을 알려주는 채널"
- 경쟁 채널과의 차별점: 논문 기반 근거 + 실천 가능성 + 공포 없는 톤

【콘텐츠 3대 원칙 — 절대 준수】

1. 기승전결 구조 (모든 콘텐츠 필수)
   - 기(起): 5초 안에 자극 훅 — 숫자, 반전, 개인화 위협 중 하나
   - 승(承): 데이터로 문제 구체화 — 논문 근거 명시
   - 전(轉): 예상을 뒤집는 반전 또는 과학적 메커니즘
   - 결(結): 오늘 당장 실천 가능한 1~3가지 액션

2. 자극 요소 (5가지 유형 중 1개 이상)
   - Type A 숫자충격형: "치매는 증상 나타나기 20년 전부터 시작된다"
   - Type B 상식반전형: "크로스워드 퍼즐은 치매 예방에 효과 없다"
   - Type C 개인화위협형: "스마트폰을 침대에서 보는 당신의 뇌에서..."
   - Type D 희망반전형: "70세에 운동을 시작해도 해마가 커진다"
   - Type E 비밀공개형: "신경과 의사가 매일 먹는 뇌 보호 식품"

3. 신뢰 데이터
   - 모든 핵심 주장에는 제공된 논문 데이터를 반드시 인용
   - 인용 형식: (저자, 연도, 저널명)
   - 의학적 조언 면책 문구를 결말에 자연스럽게 포함

【금지 사항】
- "이러면 치매 걸려요"식 공포 유발 과장
- 근거 없는 주장 ("~라고 알려져 있습니다" 같은 모호한 표현)
- 의학적 진단이나 처방 행위
- 논문에 없는 수치 창작

【출력 형식】
JSON으로만 출력. 다른 텍스트 없이 JSON만.
`;

// ── 숏폼 프롬프트 빌더 ────────────────────────────────────
function buildShortformPrompt(articles, pillar) {
  const articleSummaries = articles.slice(0, 3).map((a, i) =>
    `[논문 ${i+1}] 제목: ${a.title}\n저자/연도: ${a.authors} (${a.year})\n저널: ${a.journal}\n핵심 내용: ${a.abstract}\nPMID: ${a.pmid}`
  ).join('\n\n');

  return `
다음 논문들을 바탕으로 YouTube 숏폼 스크립트를 작성하세요.

【사용 가능한 논문 데이터】
${articleSummaries}

【콘텐츠 기둥】: ${pillar}

【숏폼 요구사항】
- 전체 길이: 50초 (한국어 약 130단어)
- 구조: 기(5초) - 승(15초) - 전(20초) - 결(10초)
- 자극 유형 선택: 위 5가지 중 가장 강력한 것 1개
- 마지막에 "다음 영상에서 더 자세히 알아봅니다" 자연스럽게 포함

다음 JSON 형식으로 출력:
{
  "type": "shortform",
  "pillar": "${pillar}",
  "stimulusType": "사용한 자극 유형 (A/B/C/D/E)",
  "hook": "첫 5초 훅 문장",
  "title": "YouTube 제목 (클릭률 최적화, 40자 이내)",
  "script": {
    "gi": "기(起) 스크립트 (5초)",
    "seung": "승(承) 스크립트 (15초)",
    "jeon": "전(轉) 스크립트 (20초)",
    "gyeol": "결(結) 스크립트 (10초)"
  },
  "fullScript": "전체 스크립트 (나레이션용, 연결된 문장)",
  "citations": [
    {
      "claim": "스크립트에서 인용한 주장",
      "source": "저자 (연도). 저널명. PMID: XXXXX",
      "pubmedUrl": "https://pubmed.ncbi.nlm.nih.gov/XXXXX/"
    }
  ],
  "tags": ["YouTube 태그 10개"],
  "description": "YouTube 설명란 텍스트 (출처 포함, 200자)",
  "disclaimer": "면책 문구"
}
`;
}

// ── 롱폼 프롬프트 빌더 ────────────────────────────────────
function buildLongformPrompt(articles, pillar) {
  const articleSummaries = articles.slice(0, 5).map((a, i) =>
    `[논문 ${i+1}] 제목: ${a.title}\n저자/연도: ${a.authors} (${a.year})\n저널: ${a.journal}\n핵심 내용: ${a.abstract}\nPMID: ${a.pmid}`
  ).join('\n\n');

  return `
다음 논문들을 바탕으로 YouTube 롱폼 스크립트를 작성하세요.

【사용 가능한 논문 데이터】
${articleSummaries}

【콘텐츠 기둥】: ${pillar}

【롱폼 요구사항】
- 전체 길이: 15분 (한국어 약 2,200단어)
- 구조:
  * 기(0~2분): 강력한 오프닝 훅 + 영상에서 배울 것 예고
  * 승(2~7분): 문제의 깊이 + 논문 데이터 2~3개
  * 전(7~13분): 반전 + 과학 메커니즘 + 해결책
  * 결(13~15분): 실천 가이드 (3가지) + 다음 편 예고 + CTA
- 나레이션 전용 (얼굴 없는 채널) - 화면 지시 포함
- 중간중간 "잠깐, 여기서 중요한 포인트" 같은 강조 마커 포함

다음 JSON 형식으로 출력:
{
  "type": "longform",
  "pillar": "${pillar}",
  "stimulusType": "사용한 자극 유형",
  "hook": "오프닝 훅 문장 (15초 안에 시청자를 잡는 문장)",
  "title": "YouTube 제목 (클릭률 최적화, 50자 이내)",
  "sections": {
    "gi": {
      "timestamp": "0:00-2:00",
      "title": "섹션 제목",
      "script": "기(起) 전체 스크립트",
      "screenNote": "화면 연출 가이드 (어떤 이미지/자막/그래픽)"
    },
    "seung": {
      "timestamp": "2:00-7:00",
      "title": "섹션 제목",
      "script": "승(承) 전체 스크립트",
      "screenNote": "화면 연출 가이드"
    },
    "jeon": {
      "timestamp": "7:00-13:00",
      "title": "섹션 제목",
      "script": "전(轉) 전체 스크립트",
      "screenNote": "화면 연출 가이드"
    },
    "gyeol": {
      "timestamp": "13:00-15:00",
      "title": "섹션 제목",
      "script": "결(結) 전체 스크립트",
      "screenNote": "화면 연출 가이드"
    }
  },
  "fullScript": "전체 나레이션 스크립트 (연결된 형태)",
  "citations": [
    {
      "claim": "인용한 주장",
      "source": "저자 (연도). 저널명. PMID: XXXXX",
      "pubmedUrl": "https://pubmed.ncbi.nlm.nih.gov/XXXXX/",
      "timestamp": "영상 내 등장 시점 (예: 3:20)"
    }
  ],
  "chapters": [
    {"timestamp": "0:00", "title": "챕터 제목"}
  ],
  "tags": ["YouTube 태그 15개"],
  "description": "YouTube 설명란 (출처 목록 포함, 500자)",
  "disclaimer": "면책 문구",
  "nextVideoTeaser": "다음 영상 예고 문구"
}
`;
}

// ── Claude API 호출 ───────────────────────────────────────
async function generateScript(prompt, contentType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API 오류: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const raw = data.content[0].text;

  // JSON 파싱 (코드 블록 제거 후)
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// ── 메인 실행 함수 ────────────────────────────────────────
async function runScriptGeneration(researchData = null, options = {}) {
  console.log('✍️  Stage 2: 스크립트 생성 시작...\n');

  // 최신 리서치 데이터 로드
  if (!researchData) {
    const researchDir = path.join(__dirname, '../output/research');
    const files = fs.readdirSync(researchDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) throw new Error('Stage 1을 먼저 실행하세요');
    researchData = JSON.parse(
      fs.readFileSync(path.join(researchDir, files[0]), 'utf8')
    );
    console.log(`  리서치 데이터 로드: ${files[0]}`);
  }

  const pillars = [
    { name: 'Pillar1_수면뇌', keywords: ['sleep', 'glymphatic'] },
    { name: 'Pillar2_치매예방', keywords: ['dementia', 'alzheimer', 'cognitive'] },
    { name: 'Pillar3_뇌영양', keywords: ['mediterranean', 'gut', 'omega'] },
    { name: 'Pillar4_뇌훈련', keywords: ['cognitive training', 'bilingual'] },
  ];

  const results = [];
  const outputDir = path.join(__dirname, '../output/scripts');
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().split('T')[0];

  // 각 기둥별 숏폼 1개 생성 (기본)
  for (const pillar of pillars) {
    const relevantArticles = researchData.articles.filter(a =>
      pillar.keywords.some(kw =>
        a.title.toLowerCase().includes(kw) ||
        a.searchTerm?.toLowerCase().includes(kw)
      )
    );

    if (relevantArticles.length < 1) {
      console.log(`  ⚠️  ${pillar.name}: 관련 논문 부족, 스킵`);
      continue;
    }

    console.log(`  생성 중: ${pillar.name} 숏폼 (논문 ${relevantArticles.length}개 활용)`);

    try {
      const prompt = buildShortformPrompt(relevantArticles, pillar.name);
      const script = await generateScript(prompt, 'shortform');

      results.push({ pillar: pillar.name, type: 'shortform', script });

      // 개별 저장
      const filename = `${timestamp}-${pillar.name}-shortform.json`;
      fs.writeFileSync(
        path.join(outputDir, filename),
        JSON.stringify(script, null, 2)
      );
      console.log(`    ✅ 저장: ${filename}`);

      // API 과부하 방지
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.log(`    ❌ 오류: ${err.message}`);
    }
  }

  // 이번 주 롱폼 1개 생성 (Pillar 순환)
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const longformPillar = pillars[weekNumber % pillars.length];
  const longformArticles = researchData.articles.filter(a =>
    longformPillar.keywords.some(kw =>
      a.title.toLowerCase().includes(kw) ||
      a.searchTerm?.toLowerCase().includes(kw)
    )
  );

  if (longformArticles.length >= 2) {
    console.log(`\n  생성 중: ${longformPillar.name} 롱폼`);
    try {
      const prompt = buildLongformPrompt(longformArticles, longformPillar.name);
      const script = await generateScript(prompt, 'longform');
      results.push({ pillar: longformPillar.name, type: 'longform', script });

      const filename = `${timestamp}-${longformPillar.name}-longform.json`;
      fs.writeFileSync(
        path.join(outputDir, filename),
        JSON.stringify(script, null, 2)
      );
      console.log(`    ✅ 저장: ${filename}`);
    } catch (err) {
      console.log(`    ❌ 롱폼 오류: ${err.message}`);
    }
  }

  console.log(`\n✅ Stage 2 완료: 총 ${results.length}개 스크립트 생성`);
  return results;
}

if (require.main === module) {
  runScriptGeneration().catch(console.error);
}

module.exports = { runScriptGeneration, generateScript, SYSTEM_PROMPT };
