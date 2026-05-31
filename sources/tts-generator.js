// ============================================================
//  STAGE 4: TTS — OpenAI TTS | OpenVoice OS 전환 가능
//  실행: node stage4-tts/tts-generator.js
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');

// ── 스크립트 텍스트 정리 ─────────────────────────────────
function prepareText(scriptJson) {
  let text = scriptJson.fullScript || '';
  if (!text && scriptJson.script) {
    const s = scriptJson.script;
    text = [s.gi, s.seung, s.jeon, s.gyeol].filter(Boolean).join(' ');
  }
  return text
    .replace(/\[.*?\]/g, '')
    .replace(/【.*?】/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── OpenAI TTS (tts-1) ───────────────────────────────────
// 비용: tts-1 $0.015/1K자 | tts-1-hd $0.030/1K자
// 숏폼 130자 ≒ $0.002 | 롱폼 2200자 ≒ $0.033
async function generateOpenAITTS(text, outputPath) {
  // 4096자 제한 — 초과 시 분할
  const chunks = splitText(text, 4000);
  const chunkPaths = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = chunks.length > 1
      ? outputPath.replace('.mp3', `_part${i+1}.mp3`)
      : outputPath;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.tts.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.tts.openai.model,
        input: chunks[i],
        voice: config.tts.openai.voice,
        speed: config.tts.openai.speed,
        response_format: config.tts.openai.outputFormat,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI TTS 오류: ${response.status} ${await response.text()}`);

    const buf = await response.arrayBuffer();
    fs.writeFileSync(chunkPath, Buffer.from(buf));
    chunkPaths.push(chunkPath);
    console.log(`    파트 ${i+1}/${chunks.length} 생성 완료`);

    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // 분할된 경우 병합 안내
  if (chunkPaths.length > 1) {
    const listFile = outputPath.replace('.mp3', '_concat.txt');
    fs.writeFileSync(listFile, chunkPaths.map(p => `file '${path.resolve(p).replace(/\\/g, '/')}'`).join('\n'));
    console.log(`\n  ⚠️  파트 파일 ${chunkPaths.length}개 생성됨. 병합 필요:`);
    console.log(`  ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`);
    return { outputPath, chunks: chunkPaths, needsMerge: true };
  }

  return { outputPath, needsMerge: false };
}

// ── OpenVoice OS (로컬/서버 설치형) ─────────────────────
// AWS Lightsail에 설치 후 HTTP API로 호출
async function generateOpenVoiceTTS(text, outputPath) {
  const endpoint = config.tts.openvoice.endpoint;

  const response = await fetch(`${endpoint}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      reference_audio: config.tts.openvoice.refAudioPath,
      output_path: outputPath,
    }),
  });

  if (!response.ok) throw new Error(`OpenVoice 오류: ${response.status}`);
  const data = await response.json();
  return { outputPath: data.output_path || outputPath, needsMerge: false };
}

// ── 텍스트 분할 ──────────────────────────────────────────
function splitText(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  const sentences = text.split(/(?<=[.!?。])\s*/);
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > maxLen) { if (cur) chunks.push(cur.trim()); cur = s; }
    else cur += (cur ? ' ' : '') + s;
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

// ── 메인 TTS 실행 ────────────────────────────────────────
async function runTTSGeneration(scriptPath = null) {
  console.log(`🎙️  Stage 4: TTS 생성 (엔진: ${config.tts.engine})\n`);

  if (!scriptPath) {
    const dir = path.join(__dirname, '../output/scripts');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    if (!files.length) throw new Error('Stage 2 먼저 실행하세요');
    scriptPath = path.join(dir, files[0]);
  }

  const scriptJson = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const basename = path.basename(scriptPath, '.json');
  const text = prepareText(scriptJson);

  console.log(`  스크립트: ${basename}`);
  console.log(`  텍스트 길이: ${text.length}자`);
  console.log(`  예상 비용: $${(text.length / 1000 * 0.015).toFixed(4)} (tts-1 기준)\n`);

  const outputDir = path.join(__dirname, '../output/audio');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${basename}.mp3`);

  let audioResult;
  if (config.tts.engine === 'openvoice') {
    console.log('  OpenVoice OS 호출 중...');
    audioResult = await generateOpenVoiceTTS(text, outputPath);
  } else {
    console.log('  OpenAI TTS 호출 중...');
    audioResult = await generateOpenAITTS(text, outputPath);
  }

  // 메타 저장 (영상 합성 단계에서 사용)
  const meta = {
    generatedAt: new Date().toISOString(),
    engine: config.tts.engine,
    scriptFile: path.basename(scriptPath),
    contentType: scriptJson.type,
    pillar: scriptJson.pillar,
    title: scriptJson.title,
    audioFile: path.basename(outputPath),
    forVideo: {
      title: scriptJson.title,
      description: scriptJson.description || '',
      tags: scriptJson.tags || [],
      citations: scriptJson.citations || [],
      chapters: scriptJson.chapters || [],
      screenNotes: extractScreenNotes(scriptJson),
      disclaimer: scriptJson.disclaimer || '',
    },
  };

  const metaPath = path.join(outputDir, `${basename}-meta.json`);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log(`\n✅ TTS 완료: ${outputPath}`);
  console.log(`📋 메타: ${metaPath}`);
  console.log('\n👤 다음: Remotion 또는 CapCut으로 영상 합성 → Stage 6 실행');

  return meta;
}

function extractScreenNotes(scriptJson) {
  if (!scriptJson.sections) return [];
  return Object.entries(scriptJson.sections)
    .filter(([, v]) => v.screenNote)
    .map(([k, v]) => ({ section: k, timestamp: v.timestamp, note: v.screenNote }));
}

if (require.main === module) runTTSGeneration().catch(console.error);
module.exports = { runTTSGeneration };
