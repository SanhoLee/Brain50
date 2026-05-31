// ============================================================
//  STAGE 5: YOUTUBE AUTO UPLOADER
//  완성된 영상을 YouTube에 예약 업로드
//  실행: node stage5-youtube/youtube-uploader.js [video-file]
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');

// ── OAuth 토큰 갱신 ──────────────────────────────────────
async function refreshAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.youtube.clientId,
      client_secret: config.youtube.clientSecret,
      refresh_token: config.youtube.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) throw new Error(`토큰 갱신 실패: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

// ── 업로드 스케줄 계산 ────────────────────────────────────
// 월(숏폼), 수(숏폼), 금(롱폼) 업로드 전략
function getNextUploadTime(contentType) {
  const now = new Date();
  const days = { 1: '월', 3: '수', 5: '금' }; // 1=월, 3=수, 5=금

  // 숏폼: 다음 월요일 or 수요일 오전 9시
  // 롱폼: 다음 금요일 오전 9시
  const targetDays = contentType === 'longform' ? [5] : [1, 3];

  let target = new Date(now);
  target.setHours(9, 0, 0, 0);

  for (let i = 0; i <= 7; i++) {
    target = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    target.setHours(9, 0, 0, 0);
    if (targetDays.includes(target.getDay()) && target > now) break;
  }

  return target.toISOString();
}

// ── YouTube 동영상 업로드 ─────────────────────────────────
async function uploadVideo(videoPath, metadata, accessToken) {
  const videoData = fs.readFileSync(videoPath);
  const fileSize = videoData.length;

  // 1단계: 업로드 세션 시작 (Resumable Upload)
  const initResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': fileSize,
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: config.youtube.defaultCategory,
          defaultLanguage: config.youtube.defaultLanguage,
        },
        status: {
          privacyStatus: config.youtube.defaultPrivacy,
          publishAt: metadata.scheduledAt || undefined,
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!initResponse.ok) {
    throw new Error(`업로드 초기화 실패: ${await initResponse.text()}`);
  }

  const uploadUrl = initResponse.headers.get('location');
  if (!uploadUrl) throw new Error('업로드 URL을 받지 못했습니다');

  // 2단계: 실제 영상 업로드
  console.log(`  업로드 중... (${Math.round(fileSize / 1024 / 1024)}MB)`);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize,
    },
    body: videoData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`영상 업로드 실패: ${await uploadResponse.text()}`);
  }

  const result = await uploadResponse.json();
  return {
    videoId: result.id,
    youtubeUrl: `https://www.youtube.com/watch?v=${result.id}`,
    status: result.status?.privacyStatus,
    scheduledAt: metadata.scheduledAt,
  };
}

// ── 썸네일 업로드 ────────────────────────────────────────
async function uploadThumbnail(videoId, thumbnailPath, accessToken) {
  if (!fs.existsSync(thumbnailPath)) {
    console.log('  ⚠️  썸네일 파일 없음. 수동으로 업로드하세요.');
    return null;
  }

  const thumbnailData = fs.readFileSync(thumbnailPath);
  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': thumbnailData.length,
      },
      body: thumbnailData,
    }
  );

  if (!response.ok) {
    console.log(`  ⚠️  썸네일 업로드 실패: ${response.status}`);
    return null;
  }

  return await response.json();
}

// ── 메인 업로드 실행 ─────────────────────────────────────
async function runYoutubeUpload(videoPath = null, metaPath = null) {
  console.log('📺 Stage 5: YouTube 업로드 시작...\n');

  // 영상 파일 찾기
  if (!videoPath) {
    const videoDir = path.join(__dirname, '../output/video');
    if (!fs.existsSync(videoDir)) throw new Error('output/video 디렉토리 없음. 영상 파일을 넣어주세요.');

    const videos = fs.readdirSync(videoDir).filter(f => f.match(/\.(mp4|mov|avi)$/i)).sort().reverse();
    if (videos.length === 0) throw new Error('업로드할 영상 파일이 없습니다.');
    videoPath = path.join(videoDir, videos[0]);
  }

  // 메타데이터 로드
  if (!metaPath) {
    const audioDir = path.join(__dirname, '../output/audio');
    const metas = fs.readdirSync(audioDir).filter(f => f.endsWith('-meta.json')).sort().reverse();
    if (metas.length > 0) metaPath = path.join(audioDir, metas[0]);
  }

  const metaJson = metaPath ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
  const forVideo = metaJson?.forVideoEditor || {};

  const contentType = metaJson?.contentType || 'shortform';
  const scheduledAt = getNextUploadTime(contentType);

  const metadata = {
    title: forVideo.title || path.basename(videoPath, path.extname(videoPath)),
    description: buildDescription(forVideo),
    tags: forVideo.tags || [],
    scheduledAt,
  };

  console.log(`  영상: ${path.basename(videoPath)}`);
  console.log(`  제목: ${metadata.title}`);
  console.log(`  예약: ${new Date(scheduledAt).toLocaleString('ko-KR')}`);

  // 토큰 갱신
  console.log('\n  OAuth 토큰 갱신 중...');
  const accessToken = await refreshAccessToken();

  // 업로드
  console.log('  YouTube 업로드 중...');
  const uploadResult = await uploadVideo(videoPath, metadata, accessToken);

  // 썸네일 (같은 디렉토리에 같은 이름의 .jpg 있으면 자동 업로드)
  const thumbnailPath = videoPath.replace(/\.(mp4|mov|avi)$/i, '.jpg');
  await uploadThumbnail(uploadResult.videoId, thumbnailPath, accessToken);

  // 업로드 로그 저장
  const log = {
    uploadedAt: new Date().toISOString(),
    videoFile: path.basename(videoPath),
    ...uploadResult,
    metadata,
  };

  const logDir = path.join(__dirname, '../output/logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `upload-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  console.log(`\n✅ 업로드 완료!`);
  console.log(`  🔗 URL: ${uploadResult.youtubeUrl}`);
  console.log(`  📅 공개 예약: ${new Date(scheduledAt).toLocaleString('ko-KR')}`);
  console.log(`  🔒 현재 상태: ${uploadResult.status}`);
  console.log(`\n👤 【당신의 검토 필요】`);
  console.log(`  1. YouTube Studio에서 영상 내용 최종 확인`);
  console.log(`  2. 썸네일 확인 (자동 업로드 안 됐으면 수동으로)`);
  console.log(`  3. 공개 예약 날짜/시간 확인 후 발행`);

  return log;
}

function buildDescription(forVideo) {
  const lines = [];

  if (forVideo.description) lines.push(forVideo.description);

  if (forVideo.citations?.length > 0) {
    lines.push('\n📚 참고 논문 (출처)');
    lines.push('─'.repeat(30));
    forVideo.citations.forEach((c, i) => {
      lines.push(`[${i+1}] ${c.claim}`);
      lines.push(`    → ${c.source}`);
      if (c.pubmedUrl) lines.push(`    🔗 ${c.pubmedUrl}`);
    });
  }

  lines.push('\n─'.repeat(30));
  lines.push(forVideo.disclaimer || '⚠️ 이 영상은 정보 제공 목적이며 의학적 조언을 대체하지 않습니다. 건강 관련 결정은 반드시 전문 의료인과 상담하세요.');

  return lines.join('\n');
}

if (require.main === module) {
  const videoArg = process.argv[2] || null;
  runYoutubeUpload(videoArg).catch(console.error);
}

module.exports = { runYoutubeUpload };
