// ============================================================
//  STAGE 4: VOICE GENERATOR (ElevenLabs API)
//  승인된 스크립트를 나레이션 음성으로 변환
//  실행: node stage4-voice/voice-generator.js [script-file]
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');

// ── 스크립트 텍스트 전처리 ────────────────────────────────
function prepareNarrationText(scriptJson) {
  let text = '';

  if (scriptJson.type === 'shortform') {
    // 숏폼: 기승전결 순서로 연결
    const s = scriptJson.script || {};
    text = [s.gi, s.seung, s.jeon, s.gyeol]
      .filter(Boolean)
      .join(' ');

  } else if (scriptJson.type === 'longform') {
    // 롱폼: 섹션별 스크립트 연결 (screenNote 제외)
    const sections = scriptJson.sections || {};
    text = ['gi', 'seung', 'jeon', 'gyeol']
      .map(k => sections[k]?.script || '')
      .filter(Boolean)
      .join('\n\n');
  }

  // fullScript가 있으면 우선 사용
  if (scriptJson.fullScript) {
    text = scriptJson.fullScript;
  }

  // 나레이션 전처리
  return text
    .replace(/\[.*?\]/g, '')       // 화면 지시문 제거 [화면: ...]
    .replace(/【.*?】/g, '')        // 마커 제거 【중요】
    .replace(/\*\*/g, '')           // 마크다운 볼드 제거
    .replace(/\s+/g, ' ')           // 공백 정리
    .trim();
}

// ── ElevenLabs API 호출 ──────────────────────────────────
async function generateVoice(text, outputPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabs.voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': config.elevenlabs.apiKey,
    },
    body: JSON.stringify({
      text: text,
      model_id: config.elevenlabs.modelId,
      voice_settings: config.elevenlabs.settings,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API 오류: ${response.status} — ${err}`);
  }

  const audioBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  // 파일 크기로 대략 길이 추정 (MP3 128kbps 기준)
  const fileSizeKB = Buffer.from(audioBuffer).length / 1024;
  const estimatedSeconds = Math.round(fileSizeKB / 16); // 128kbps = 16KB/s

  return {
    outputPath,
    fileSizeKB: Math.round(fileSizeKB),
    estimatedDurationSeconds: estimatedSeconds,
    estimatedDurationMin: `${Math.floor(estimatedSeconds / 60)}:${String(estimatedSeconds % 60).padStart(2, '0')}`,
  };
}

// ── 긴 텍스트 분할 처리 (ElevenLabs 5000자 제한) ─────────
function splitText(text, maxLength = 4800) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());

  return chunks;
}

// ── 청크 병합 (여러 MP3를 하나로) ───────────────────────
// 참고: 실제 병합은 ffmpeg 사용 권장
function createConcatInstruction(chunkPaths, outputPath) {
  const listFile = outputPath.replace('.mp3', '_concat.txt');
  const content = chunkPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(listFile, content);

  return {
    ffmpegCommand: `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`,
    listFile,
  };
}

// ── 메인 음성 생성 ────────────────────────────────────────
async function runVoiceGeneration(scriptPath = null) {
  console.log('🎙️  Stage 4: 음성 생성 시작...\n');

  // 승인된 최신 스크립트 로드
  if (!scriptPath) {
    const scriptsDir = path.join(__dirname, '../output/scripts');
    const files = fs.readdirSync(scriptsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) throw new Error('스크립트 파일 없음. Stage 2를 먼저 실행하세요.');
    scriptPath = path.join(scriptsDir, files[0]);
  }

  const scriptJson = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const basename = path.basename(scriptPath, '.json');
  console.log(`  스크립트: ${basename}`);

  // 텍스트 준비
  const narrationText = prepareNarrationText(scriptJson);
  console.log(`  나레이션 길이: ${narrationText.length}자`);

  const outputDir = path.join(__dirname, '../output/audio');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${basename}.mp3`);

  // 텍스트 분할 여부 확인
  const chunks = splitText(narrationText);
  let audioInfo;

  if (chunks.length === 1) {
    // 단일 호출
    console.log('  ElevenLabs API 호출 중...');
    audioInfo = await generateVoice(narrationText, outputPath);

  } else {
    // 분할 처리
    console.log(`  텍스트가 길어 ${chunks.length}개 청크로 분할 처리`);
    const chunkPaths = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(outputDir, `${basename}_chunk${i+1}.mp3`);
      console.log(`  청크 ${i+1}/${chunks.length} 생성 중...`);
      await generateVoice(chunks[i], chunkPath);
      chunkPaths.push(chunkPath);
      await new Promise(r => setTimeout(r, 1000)); // API 쿨다운
    }

    const concat = createConcatInstruction(chunkPaths, outputPath);
    console.log(`\n  ⚠️  청크 병합 필요. 다음 명령어를 실행하세요:`);
    console.log(`  ${concat.ffmpegCommand}`);

    audioInfo = {
      outputPath,
      chunks: chunkPaths,
      ffmpegCommand: concat.ffmpegCommand,
      note: '청크 파일들을 ffmpeg로 병합하세요',
    };
  }

  // 메타데이터 저장
  const meta = {
    generatedAt: new Date().toISOString(),
    scriptFile: path.basename(scriptPath),
    contentType: scriptJson.type,
    pillar: scriptJson.pillar,
    title: scriptJson.title,
    audioInfo,
    // 영상 제작에 필요한 정보
    forVideoEditor: {
      title: scriptJson.title,
      chapters: scriptJson.chapters || [],
      screenNotes: extractScreenNotes(scriptJson),
      citations: scriptJson.citations || [],
      description: scriptJson.description || '',
      tags: scriptJson.tags || [],
      disclaimer: scriptJson.disclaimer || '',
    },
  };

  const metaPath = path.join(outputDir, `${basename}-meta.json`);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log(`\n✅ 음성 생성 완료`);
  console.log(`  🎵 오디오: ${outputPath}`);
  if (audioInfo.estimatedDurationMin) {
    console.log(`  ⏱️  예상 길이: ${audioInfo.estimatedDurationMin}`);
  }
  console.log(`  📋 메타데이터: ${metaPath}`);
  console.log('\n👤 【다음 단계】 Pictory/Invideo에 오디오 업로드 후 영상 합성하세요.');

  return meta;
}

function extractScreenNotes(scriptJson) {
  const notes = [];
  if (scriptJson.sections) {
    for (const [key, section] of Object.entries(scriptJson.sections)) {
      if (section.screenNote) {
        notes.push({
          section: key,
          timestamp: section.timestamp,
          note: section.screenNote,
        });
      }
    }
  }
  return notes;
}

if (require.main === module) {
  const scriptArg = process.argv[2] || null;
  runVoiceGeneration(scriptArg).catch(console.error);
}

module.exports = { runVoiceGeneration, generateVoice };
