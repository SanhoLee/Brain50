// ============================================================
//  CONFIG.JS — 전체 파이프라인 설정 파일
//  ⚠️  본인 API 키로 교체 후 사용하세요
// ============================================================

module.exports = {

  // ── ANTHROPIC (Claude API) ────────────────────────────────
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || 'YOUR_ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4000,
  },

  // ── ELEVENLABS (음성 생성) ────────────────────────────────
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || 'YOUR_ELEVENLABS_API_KEY',
    // 추천 목소리: 차분하고 신뢰감 있는 남성 목소리
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'YOUR_VOICE_ID',
    modelId: 'eleven_multilingual_v2', // 한국어 지원
    settings: {
      stability: 0.75,
      similarity_boost: 0.85,
      style: 0.2,
      use_speaker_boost: true,
    },
  },

  // ── YOUTUBE DATA API v3 ───────────────────────────────────
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || 'YOUR_CLIENT_ID',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || 'YOUR_REFRESH_TOKEN',
    // 업로드 기본 설정
    defaultPrivacy: 'private',    // 검토 후 수동으로 public 전환
    defaultCategory: '27',        // Education 카테고리
    defaultLanguage: 'ko',
  },

  // ── PUBMED API (무료, API 키 선택사항) ───────────────────
  pubmed: {
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    apiKey: process.env.PUBMED_API_KEY || null, // 없어도 동작 (속도 제한만 있음)
    maxResults: 5,
    // 검색 키워드 — 채널 4개 기둥에 맞춤
    searchTerms: [
      // Pillar 1: 수면 × 뇌
      'sleep duration dementia risk longitudinal',
      'glymphatic system sleep brain clearance',
      'sleep quality cognitive decline aging',
      // Pillar 2: 치매 예방
      'dementia prevention modifiable risk factors 2024',
      'alzheimer early biomarkers prevention intervention',
      'cognitive decline exercise BDNF elderly',
      // Pillar 3: 뇌 영양
      'mediterranean diet cognitive aging brain',
      'gut brain axis cognition microbiome',
      'omega3 brain health aging evidence',
      // Pillar 4: 뇌 훈련
      'cognitive training dementia prevention effectiveness',
      'bilingualism dementia onset delay',
    ],
  },

  // ── 콘텐츠 설정 ──────────────────────────────────────────
  content: {
    channel: {
      name: 'Brain After 50',
      language: 'ko',         // 'ko' 또는 'en'
      targetAudience: '45-70세',
    },
    shortform: {
      targetDuration: 50,     // 초
      targetWordCount: 130,   // 한국어 기준 50초 분량
    },
    longform: {
      targetDuration: 900,    // 초 (15분)
      targetWordCount: 2200,  // 한국어 기준 15분 분량
    },
  },

  // ── 출력 경로 ─────────────────────────────────────────────
  output: {
    scriptsDir: './output/scripts',
    audioDir: './output/audio',
    citationsDir: './output/citations',
    logsDir: './output/logs',
  },
};
