// ============================================================
//  MASTER RUNNER — 클라우드 서버 운영 버전
//  실행: node run-pipeline.js
//  특정 스테이지: node run-pipeline.js --stage=1,2
// ============================================================

require('dotenv').config();

const { runResearchFetch }    = require('./stage1-research/pubmed-fetcher');
const { runScriptGeneration } = require('./stage2-script/script-generator');
const { runFactCheck }        = require('./stage3-factcheck/fact-checker');
const { runTTSGeneration }    = require('./stage4-tts/tts-generator');
const { runVideoGeneration }  = require('./stage5-video/video-generator');
const { sendMessage }         = require('./telegram-bot');
const fs   = require('fs');
const path = require('path');

const stageArg = process.argv.find(a => a.startsWith('--stage='));
const targetStages = stageArg
  ? stageArg.replace('--stage=', '').split(',').map(Number)
  : [1, 2, 3, 4, 5];

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runPipeline() {
  const startTime = new Date();
  console.log('🚀 Brain Content Pipeline 시작\n');
  console.log(`   LLM: ${process.env.DEFAULT_LLM || 'anthropic'} | TTS: ${process.env.TTS_ENGINE || 'openai'}`);
  console.log(`   스테이지: ${targetStages.join(', ')}`);
  console.log(`   시작: ${startTime.toLocaleString('ko-KR')}`);
  console.log('═'.repeat(50) + '\n');

  ['output/research','output/scripts','output/audio',
   'output/video','output/factcheck','output/logs'].forEach(d => {
    fs.mkdirSync(path.join(__dirname, d), { recursive: true });
  });

  const log = { startedAt: startTime.toISOString(), stages: {} };

  // Stage 1
  let researchData = null;
  if (targetStages.includes(1)) {
    console.log('━'.repeat(50));
    console.log('STAGE 1: PubMed 논문 수집');
    console.log('━'.repeat(50));
    try {
      researchData = await runResearchFetch();
      log.stages.stage1 = { status: 'success', articles: researchData.totalArticles };
      await delay(2000);
    } catch (e) {
      log.stages.stage1 = { status: 'error', error: e.message };
      await sendMessage(`❌ *Stage 1 실패*\n\`${e.message}\`\n\n서버 SSH 접속 후 확인 필요`);
      saveLog(log); process.exit(1);
    }
  }

  // Stage 2
  if (targetStages.includes(2)) {
    console.log('\n' + '━'.repeat(50));
    console.log('STAGE 2: 스크립트 생성');
    console.log('━'.repeat(50));
    try {
      await runScriptGeneration(researchData);
      log.stages.stage2 = { status: 'success' };
      await delay(2000);
    } catch (e) {
      log.stages.stage2 = { status: 'error', error: e.message };
      await sendMessage(`❌ *Stage 2 실패*\n\`${e.message}\``);
      saveLog(log); process.exit(1);
    }
  }

  // Stage 3
  if (targetStages.includes(3)) {
    console.log('\n' + '━'.repeat(50));
    console.log('STAGE 3: 팩트체크');
    console.log('━'.repeat(50));
    try {
      const report = await runFactCheck();
      log.stages.stage3 = { status: 'success', overall: report.overallStatus };

      if (report.summary.unverified > 0 || report.redFlags.length > 0) {
        await sendMessage(
          `⚠️ *팩트체크 경고 — 검토 필요*\n\n` +
          `미검증 주장: ${report.summary.unverified}개\n` +
          `위험 표현: ${report.redFlags.length}개\n\n` +
          `👉 스크립트 수정 후 다시 실행:\n` +
          `/run 으로 재실행 가능`
        );
        saveLog(log); process.exit(0);
      }
      await delay(1500);
    } catch (e) {
      log.stages.stage3 = { status: 'error', error: e.message };
    }
  }

  // Stage 4
  if (targetStages.includes(4)) {
    console.log('\n' + '━'.repeat(50));
    console.log(`STAGE 4: TTS 음성 생성`);
    console.log('━'.repeat(50));
    try {
      await runTTSGeneration();
      log.stages.stage4 = { status: 'success' };
    } catch (e) {
      log.stages.stage4 = { status: 'error', error: e.message };
      console.error(`Stage 4 실패: ${e.message}`);
    }
  }

  // Stage 5
  if (targetStages.includes(5)) {
    console.log('\n' + '━'.repeat(50));
    console.log('STAGE 5: Remotion 영상 합성');
    console.log('━'.repeat(50));
    try {
      await runVideoGeneration();
      log.stages.stage5 = { status: 'success' };
    } catch (e) {
      log.stages.stage5 = { status: 'error', error: e.message };
      console.error(`Stage 5 실패: ${e.message}`);
    }
  }

  // 완료 Telegram 알림
  const successCount = Object.values(log.stages).filter(s => s.status === 'success').length;
  const elapsed = Math.round((Date.now() - startTime.getTime()) / 60000);

  await sendMessage(
    `✅ *파이프라인 완료!* (${successCount}/${targetStages.length} 성공, ${elapsed}분 소요)\n\n` +
    `📋 *지금 해야 할 것:*\n` +
    `1. 스크립트 검토 — SSH 접속 후:\n` +
    `\`cat ~/brain-pipeline/output/scripts/최신파일.json\`\n\n` +
    `2. 음성 파일 확인 후 영상 합성\n\n` +
    `3. YouTube 업로드 준비 완료 후:\n` +
    `/run_upload 로 업로드 실행`
  );

  saveLog(log);
  console.log('\n✅ 완료! Telegram으로 알림 발송됨');
}

function saveLog(log) {
  log.completedAt = new Date().toISOString();
  const p = path.join(__dirname, `output/logs/pipeline-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(log, null, 2));
}

runPipeline().catch(async (e) => {
  console.error('파이프라인 오류:', e);
  await sendMessage(`💥 *파이프라인 예상치 못한 오류*\n\`${e.message}\``);
});
