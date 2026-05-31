// ============================================================
//  MASTER RUNNER — 전체 파이프라인 순서 실행
//  실행: node run-pipeline.js
//  옵션: node run-pipeline.js --stage=1,2  (특정 스테이지만)
// ============================================================

const { runResearchFetch } = require('./stage1-research/pubmed-fetcher');
const { runScriptGeneration } = require('./stage2-script/claude-script-generator');
const { runFactCheck } = require('./stage3-factcheck/fact-checker');
const { runVoiceGeneration } = require('./stage4-voice/voice-generator');
const fs = require('fs');
const path = require('path');

// 실행할 스테이지 파싱 (--stage=1,2,3 형식)
const stageArg = process.argv.find(a => a.startsWith('--stage='));
const targetStages = stageArg
  ? stageArg.replace('--stage=', '').split(',').map(Number)
  : [1, 2, 3, 4]; // 기본: Stage 1~4 (5는 영상 합성 후 수동)

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runPipeline() {
  console.log('🚀 Brain Content Pipeline 시작\n');
  console.log(`   실행 스테이지: ${targetStages.join(', ')}`);
  console.log(`   시작 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log('═'.repeat(55) + '\n');

  // 출력 디렉토리 초기화
  ['output/research', 'output/scripts', 'output/audio',
   'output/factcheck', 'output/video', 'output/logs'].forEach(dir => {
    fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
  });

  const pipelineLog = {
    startedAt: new Date().toISOString(),
    stages: {},
  };

  // ── Stage 1: Research Fetch ───────────────────────────
  let researchData = null;
  if (targetStages.includes(1)) {
    console.log('━'.repeat(55));
    console.log('STAGE 1: PubMed 논문 수집');
    console.log('━'.repeat(55));
    try {
      researchData = await runResearchFetch();
      pipelineLog.stages.stage1 = { status: 'success', articles: researchData.totalArticles };
      console.log('\n⏸  3초 대기...\n');
      await delay(3000);
    } catch (err) {
      pipelineLog.stages.stage1 = { status: 'error', error: err.message };
      console.error(`\n❌ Stage 1 실패: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Stage 2: Script Generation ────────────────────────
  let scripts = null;
  if (targetStages.includes(2)) {
    console.log('━'.repeat(55));
    console.log('STAGE 2: 스크립트 생성 (Claude API)');
    console.log('━'.repeat(55));
    try {
      scripts = await runScriptGeneration(researchData);
      pipelineLog.stages.stage2 = { status: 'success', scriptsGenerated: scripts.length };
      console.log('\n⏸  3초 대기...\n');
      await delay(3000);
    } catch (err) {
      pipelineLog.stages.stage2 = { status: 'error', error: err.message };
      console.error(`\n❌ Stage 2 실패: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Stage 3: Fact Check ───────────────────────────────
  if (targetStages.includes(3)) {
    console.log('━'.repeat(55));
    console.log('STAGE 3: 팩트체크 & 출처 검증');
    console.log('━'.repeat(55));
    try {
      const report = await runFactCheck();
      pipelineLog.stages.stage3 = { status: 'success', overallStatus: report.overallStatus };

      // 미검증 주장이 있으면 파이프라인 중단 (안전 장치)
      if (report.summary.unverified > 0 || report.redFlags.length > 0) {
        console.log('\n🛑 팩트체크 실패 — 파이프라인 중단');
        console.log('   미검증 주장 또는 위험 표현 발견. 스크립트를 수정 후 재실행하세요.');
        console.log(`   팩트체크 리포트: output/factcheck/`);
        savePipelineLog(pipelineLog);
        process.exit(0);
      }

      console.log('\n⏸  2초 대기...\n');
      await delay(2000);
    } catch (err) {
      pipelineLog.stages.stage3 = { status: 'error', error: err.message };
      console.error(`\n❌ Stage 3 실패: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Stage 4: Voice Generation ─────────────────────────
  if (targetStages.includes(4)) {
    console.log('━'.repeat(55));
    console.log('STAGE 4: 음성 생성 (ElevenLabs)');
    console.log('━'.repeat(55));
    try {
      const audioMeta = await runVoiceGeneration();
      pipelineLog.stages.stage4 = { status: 'success', audioFile: audioMeta.audioInfo?.outputPath };
    } catch (err) {
      pipelineLog.stages.stage4 = { status: 'error', error: err.message };
      console.error(`\n❌ Stage 4 실패: ${err.message}`);
    }
  }

  // ── 완료 요약 ────────────────────────────────────────
  pipelineLog.completedAt = new Date().toISOString();
  savePipelineLog(pipelineLog);

  console.log('\n' + '═'.repeat(55));
  console.log('✅ 파이프라인 완료!');
  console.log('═'.repeat(55));
  console.log('\n📋 스테이지별 결과:');
  for (const [stage, result] of Object.entries(pipelineLog.stages)) {
    const icon = result.status === 'success' ? '✅' : '❌';
    console.log(`  ${icon} ${stage}: ${result.status}`);
  }

  console.log('\n━'.repeat(55));
  console.log('👤 【지금부터 당신이 해야 할 것】');
  console.log('━'.repeat(55));
  console.log('1. output/factcheck/ 에서 검증 리포트 확인');
  console.log('2. output/scripts/ 에서 스크립트 내용 검토 (15~20분)');
  console.log('3. output/audio/ 에서 음성 파일 청취 확인');
  console.log('4. Pictory/Invideo에 오디오 업로드 → 영상 합성');
  console.log('5. 완성 영상을 output/video/에 저장 후:');
  console.log('   node stage5-youtube/youtube-uploader.js 실행');
  console.log('━'.repeat(55));
}

function savePipelineLog(log) {
  const logPath = path.join(__dirname, `output/logs/pipeline-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\n📁 파이프라인 로그: ${logPath}`);
}

runPipeline().catch(console.error);
