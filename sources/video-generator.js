// ============================================================
//  STAGE 5: VIDEO — Remotion 자동 영상 합성
//  Remotion은 React 기반 영상 제작 도구 (개발자 무료)
//  실행: node stage5-video/video-generator.js
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const config = require('../config');

// ── Remotion 프로젝트 초기화 (최초 1회만) ───────────────
function initRemotionProject() {
  const remotionDir = path.join(__dirname, '../remotion-project');
  if (fs.existsSync(remotionDir)) return remotionDir;

  console.log('  Remotion 프로젝트 초기화 중...');
  fs.mkdirSync(remotionDir, { recursive: true });

  // package.json 생성
  const pkg = {
    name: 'brain-content-remotion',
    version: '1.0.0',
    scripts: {
      render: 'remotion render',
      studio: 'remotion studio',
    },
    dependencies: {
      '@remotion/bundler': '4.0.0',
      '@remotion/cli': '4.0.0',
      '@remotion/renderer': '4.0.0',
      remotion: '4.0.0',
      react: '18.2.0',
      'react-dom': '18.2.0',
    },
    devDependencies: {
      '@types/react': '18.2.0',
      typescript: '5.0.0',
    },
  };
  fs.writeFileSync(path.join(remotionDir, 'package.json'), JSON.stringify(pkg, null, 2));

  // 숏폼 컴포넌트 생성
  createRemotionComponents(remotionDir);

  console.log(`  Remotion 프로젝트 생성: ${remotionDir}`);
  console.log(`  npm install 실행 필요: cd remotion-project && npm install`);
  return remotionDir;
}

// ── Remotion 컴포넌트 생성 ───────────────────────────────
function createRemotionComponents(remotionDir) {
  fs.mkdirSync(path.join(remotionDir, 'src'), { recursive: true });

  // 숏폼 메인 컴포넌트 (9:16 세로형)
  const shortformComponent = `
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import React from 'react';

interface ShortformProps {
  audioSrc: string;
  title: string;
  sections: { gi: string; seung: string; jeon: string; gyeol: string };
  citations: { claim: string; source: string }[];
  backgroundColor?: string;
}

export const ShortformVideo: React.FC<ShortformProps> = ({
  audioSrc, title, sections, citations, backgroundColor = '#0a0a0a'
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // 기승전결 타이밍 (50초 기준 30fps = 1500프레임)
  const GI_END     = Math.round(fps * 5);
  const SEUNG_END  = Math.round(fps * 20);
  const JEON_END   = Math.round(fps * 40);
  const GYEOL_END  = durationInFrames;

  const getSection = () => {
    if (frame < GI_END) return { text: sections.gi, color: '#FF6B35', label: '기(起)' };
    if (frame < SEUNG_END) return { text: sections.seung, color: '#4FC3F7', label: '승(承)' };
    if (frame < JEON_END) return { text: sections.jeon, color: '#A5D6A7', label: '전(轉)' };
    return { text: sections.gyeol, color: '#FFD54F', label: '결(結)' };
  };

  const current = getSection();
  const opacity = interpolate(frame % (fps * 0.5), [0, fps * 0.25], [0.7, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 배경 그라디언트 */}
      <AbsoluteFill style={{
        background: \`radial-gradient(ellipse at center, \${current.color}15 0%, transparent 70%)\`,
        transition: 'background 0.5s',
      }} />

      {/* 오디오 */}
      <Audio src={audioSrc} />

      {/* 메인 텍스트 */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '40px',
      }}>
        {/* 섹션 라벨 */}
        <div style={{
          color: current.color, fontSize: 24, fontWeight: 700,
          marginBottom: 20, opacity: 0.8, letterSpacing: 4,
        }}>
          {current.label}
        </div>

        {/* 본문 텍스트 */}
        <div style={{
          color: '#FFFFFF', fontSize: 38, fontWeight: 600,
          textAlign: 'center', lineHeight: 1.6, opacity,
          textShadow: '0 2px 20px rgba(0,0,0,0.8)',
          maxWidth: '90%',
        }}>
          {current.text}
        </div>
      </AbsoluteFill>

      {/* 하단 출처 표기 */}
      {citations.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 60, left: 20, right: 20,
          color: 'rgba(255,255,255,0.5)', fontSize: 16,
          textAlign: 'center',
        }}>
          출처: {citations[0].source}
        </div>
      )}

      {/* 진행바 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        width: \`\${(frame / durationInFrames) * 100}%\`,
        height: 4, backgroundColor: current.color,
      }} />
    </AbsoluteFill>
  );
};
`.trim();

  // Root 컴포넌트
  const rootComponent = `
import { Composition } from 'remotion';
import { ShortformVideo } from './ShortformVideo';
import React from 'react';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ShortformVideo"
      component={ShortformVideo}
      durationInFrames={1500}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        audioSrc: '',
        title: '',
        sections: { gi: '', seung: '', jeon: '', gyeol: '' },
        citations: [],
      }}
    />
  </>
);
`.trim();

  fs.writeFileSync(path.join(remotionDir, 'src', 'ShortformVideo.tsx'), shortformComponent);
  fs.writeFileSync(path.join(remotionDir, 'src', 'Root.tsx'), rootComponent);
  fs.writeFileSync(path.join(remotionDir, 'src', 'index.ts'), `export { RemotionRoot as default } from './Root';`);
}

// ── Remotion 렌더링 실행 ─────────────────────────────────
async function renderWithRemotion(metaJson, audioPath) {
  const remotionDir = path.join(__dirname, '../remotion-project');
  const outputDir = path.join(__dirname, '../output/video');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir,
    `${path.basename(audioPath, '.mp3')}.mp4`
  );

  // Props를 JSON 파일로 저장 (Windows 경로 이슈 방지)
  const propsFile = path.join(remotionDir, 'render-props.json');
  const props = {
    audioSrc: audioPath.replace(/\\/g, '/'),
    title: metaJson.forVideo.title,
    sections: metaJson.forVideo.screenNotes?.reduce((acc, n) => {
      acc[n.section] = n.note; return acc;
    }, { gi: '', seung: '', jeon: '', gyeol: '' }) || { gi: '', seung: '', jeon: '', gyeol: '' },
    citations: (metaJson.forVideo.citations || []).slice(0, 1),
  };
  fs.writeFileSync(propsFile, JSON.stringify(props));

  // Remotion CLI 렌더링
  const cmd = `cd "${remotionDir}" && npx remotion render ShortformVideo "${outputFile}" --props="${propsFile}"`;
  console.log('  Remotion 렌더링 시작...');
  console.log(`  명령어: ${cmd}\n`);

  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
      if (err) {
        console.log('  ⚠️  렌더링 오류:', stderr);
        reject(new Error(stderr));
      } else {
        console.log(`  ✅ 영상 완성: ${outputFile}`);
        resolve(outputFile);
      }
    });
  });
}

// ── CapCut API 폴백 (사용 가능한 경우) ──────────────────
async function renderWithCapCut(metaJson, audioPath) {
  // CapCut API는 현재 베타 — 사용 가능해지면 여기 구현
  throw new Error('CapCut API 미지원 — Remotion 또는 수동 편집 사용');
}

// ── 메인 영상 생성 ────────────────────────────────────────
async function runVideoGeneration(audioPath = null) {
  console.log(`🎬 Stage 5: 영상 생성 (엔진: ${config.video.engine})\n`);

  // 최신 오디오 + 메타 로드
  if (!audioPath) {
    const audioDir = path.join(__dirname, '../output/audio');
    const files = fs.readdirSync(audioDir)
      .filter(f => f.endsWith('.mp3') && !f.includes('part'))
      .sort().reverse();
    if (!files.length) throw new Error('Stage 4 먼저 실행하세요');
    audioPath = path.join(audioDir, files[0]);
  }

  const metaPath = audioPath.replace('.mp3', '-meta.json');
  if (!fs.existsSync(metaPath)) throw new Error(`메타 파일 없음: ${metaPath}`);
  const metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  console.log(`  오디오: ${path.basename(audioPath)}`);
  console.log(`  제목: ${metaJson.forVideo?.title}`);

  if (config.video.engine === 'remotion') {
    initRemotionProject();

    // Remotion npm 설치 확인
    const remotionDir = path.join(__dirname, '../remotion-project');
    if (!fs.existsSync(path.join(remotionDir, 'node_modules'))) {
      console.log('\n  ⚠️  Remotion 의존성 미설치. 아래 명령어 실행 후 재시도:\n');
      console.log(`  cd "${remotionDir}"`);
      console.log('  npm install\n');
      return null;
    }

    return await renderWithRemotion(metaJson, audioPath);
  } else {
    return await renderWithCapCut(metaJson, audioPath);
  }
}

if (require.main === module) runVideoGeneration().catch(console.error);
module.exports = { runVideoGeneration, initRemotionProject };
