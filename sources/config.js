// ============================================================
//  CONFIG.JS — 파이프라인 설정 (클라우드 서버 운영 버전)
//  서버의 ~/brain-pipeline/.env 파일에서 자동 로드
// ============================================================

require('dotenv').config();

module.exports = {

  // ── LLM 설정 (Anthropic + OpenAI 혼용) ─────────────────
  llm: {
    default: process.env.DEFAULT_LLM || 'anthropic',
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4000,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      modelShortform: 'gpt-4o-mini',  // 숏폼 저렴하게
      modelLongform: 'gpt-4o',         // 롱폼 고품질
      maxTokens: 4000,
    },
  },

  // ── TTS 설정 ─────────────────────────────────────────────
  tts: {
    engine: process.env.TTS_ENGINE || 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: 'tts-1',
      voice: 'onyx',
      speed: 0.95,
      outputFormat: 'mp3',
    },
    openvoice: {
      endpoint: process.env.OPENVOICE_ENDPOINT || 'http://localhost:8000',
      refAudioPath: './voice-reference/reference.wav',
    },
  },

  // ── 영상 설정 ────────────────────────────────────────────
  video: {
    engine: process.env.VIDEO_ENGINE || 'remotion',
    remotion: {
      outputDir: './output/video',
      fps: 30,
      width: 1080,
      height: 1920,
    },
  },

  // ── YouTube ──────────────────────────────────────────────
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
    defaultPrivacy: 'private',
    defaultCategory: '27',
    defaultLanguage: process.env.CHANNEL_LANGUAGE || 'ko',
  },

  // ── PubMed ───────────────────────────────────────────────
  pubmed: {
    apiKey: process.env.PUBMED_API_KEY || null, // 없으면 3req/sec, 있으면 10req/sec
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    maxResults: 5,
    searchTerms: [
      'sleep duration dementia risk longitudinal',
      'glymphatic system sleep brain clearance',
      'sleep quality cognitive decline aging',
      'dementia prevention modifiable risk factors 2024',
      'alzheimer early biomarkers prevention',
      'cognitive decline exercise BDNF elderly',
      'mediterranean diet cognitive aging brain',
      'gut brain axis cognition microbiome',
      'omega3 brain health aging evidence',
      'cognitive training dementia prevention',
    ],
  },

  // ── Telegram (알림 + 명령 수신) ──────────────────────────
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  // ── 출력 경로 ────────────────────────────────────────────
  output: {
    research: './output/research',
    scripts:  './output/scripts',
    audio:    './output/audio',
    video:    './output/video',
    factcheck:'./output/factcheck',
    logs:     './output/logs',
  },
};
