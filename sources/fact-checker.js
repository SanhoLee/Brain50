// ============================================================
//  STAGE 3: FACT CHECK & CITATION VALIDATOR
//  생성된 스크립트의 주장을 PubMed로 교차 검증
//  건강 정보 채널의 핵심 신뢰도 보장 장치
//  실행: node stage3-factcheck/fact-checker.js
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { searchPubMed, fetchArticleDetails } = require('../stage1-research/pubmed-fetcher');

// ── 검증 상태 등급 ────────────────────────────────────────
const VERIFICATION_STATUS = {
  VERIFIED: '✅ 검증됨',       // PubMed에서 일치 근거 발견
  PARTIAL: '🟡 부분 검증',    // 관련 논문 있으나 수치 불일치
  UNVERIFIED: '❌ 미검증',    // PubMed에서 근거 없음
  NEEDS_REVIEW: '⚠️ 검토 필요', // 모호하거나 과장 가능성
};

// ── 위험 표현 감지 (과장/공포 표현 필터) ─────────────────
const RED_FLAG_PATTERNS = [
  { pattern: /반드시|절대|무조건|100%/, reason: '단정적 표현' },
  { pattern: /기적|혁명적|완전히/, reason: '과장 표현' },
  { pattern: /확실히 예방|완전 치료/, reason: '의학적 과장' },
  { pattern: /\d+배 더 빠르게/, reason: '미검증 배수 주장' },
];

// ── 특정 주장에서 핵심 수치/사실 추출 ───────────────────
function extractClaims(scriptJson) {
  const claims = [];

  // citations 배열에서 직접 추출
  if (scriptJson.citations && Array.isArray(scriptJson.citations)) {
    for (const cite of scriptJson.citations) {
      claims.push({
        claim: cite.claim,
        providedSource: cite.source,
        providedPmid: extractPmid(cite.source),
        pubmedUrl: cite.pubmedUrl || null,
      });
    }
  }

  // 훅/제목에서도 수치 주장 추출
  const hookText = scriptJson.hook || '';
  const numericClaims = hookText.match(/\d+(%|배|년|명|세)/g);
  if (numericClaims) {
    claims.push({
      claim: hookText,
      providedSource: '훅 문장 — 원본 출처 확인 필요',
      providedPmid: null,
      isHook: true,
    });
  }

  return claims;
}

function extractPmid(sourceStr) {
  const match = sourceStr?.match(/PMID:\s*(\d+)/i);
  return match ? match[1] : null;
}

// ── PMID로 PubMed 직접 검증 ──────────────────────────────
async function verifyByPmid(pmid, claim) {
  if (!pmid) return { status: VERIFICATION_STATUS.UNVERIFIED, note: 'PMID 없음' };

  try {
    await new Promise(r => setTimeout(r, 400));
    const articles = await fetchArticleDetails([pmid]);

    if (articles.length === 0) {
      return {
        status: VERIFICATION_STATUS.UNVERIFIED,
        note: `PMID ${pmid} — PubMed에서 찾을 수 없음`,
      };
    }

    const article = articles[0];

    // 주장과 논문 abstract 대조 (키워드 매칭)
    const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const abstractWords = article.abstract.toLowerCase();
    const matchCount = claimWords.filter(w => abstractWords.includes(w)).length;
    const matchRate = matchCount / claimWords.length;

    if (matchRate >= 0.4) {
      return {
        status: VERIFICATION_STATUS.VERIFIED,
        note: `논문 확인: ${article.authors} (${article.year}). ${article.journal}`,
        articleTitle: article.title,
        matchRate: Math.round(matchRate * 100) + '%',
      };
    } else {
      return {
        status: VERIFICATION_STATUS.PARTIAL,
        note: `논문 존재하나 주장과 내용 불일치 (매칭률 ${Math.round(matchRate * 100)}%)`,
        articleTitle: article.title,
      };
    }
  } catch (err) {
    return { status: VERIFICATION_STATUS.NEEDS_REVIEW, note: `검증 오류: ${err.message}` };
  }
}

// ── 키워드로 PubMed 재검색 검증 ─────────────────────────
async function verifyBySearch(claim) {
  // 주장에서 핵심 키워드 추출 (숫자 포함 구문)
  const keywords = claim
    .replace(/[^\w\s%]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 5)
    .join(' ');

  if (!keywords) return { status: VERIFICATION_STATUS.UNVERIFIED, note: '키워드 추출 실패' };

  try {
    await new Promise(r => setTimeout(r, 400));
    const pmids = await searchPubMed(keywords, 3);

    if (pmids.length === 0) {
      return {
        status: VERIFICATION_STATUS.UNVERIFIED,
        note: `"${keywords}" — 관련 논문 없음`,
      };
    }

    return {
      status: VERIFICATION_STATUS.PARTIAL,
      note: `관련 논문 ${pmids.length}개 발견. 수동 확인 필요`,
      searchKeywords: keywords,
      foundPmids: pmids,
    };
  } catch (err) {
    return { status: VERIFICATION_STATUS.NEEDS_REVIEW, note: `검색 오류: ${err.message}` };
  }
}

// ── 위험 표현 스캔 ────────────────────────────────────────
function scanRedFlags(scriptJson) {
  const fullText = JSON.stringify(scriptJson);
  const flags = [];

  for (const { pattern, reason } of RED_FLAG_PATTERNS) {
    if (pattern.test(fullText)) {
      const match = fullText.match(pattern);
      flags.push({ pattern: pattern.toString(), reason, example: match?.[0] });
    }
  }

  return flags;
}

// ── 메인 팩트체크 실행 ────────────────────────────────────
async function runFactCheck(scriptPath = null) {
  console.log('🔍 Stage 3: 팩트체크 & 출처 검증 시작...\n');

  // 최신 스크립트 로드
  if (!scriptPath) {
    const scriptsDir = path.join(__dirname, '../output/scripts');
    const files = fs.readdirSync(scriptsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) throw new Error('Stage 2를 먼저 실행하세요');
    scriptPath = path.join(scriptsDir, files[0]);
  }

  const scriptJson = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const filename = path.basename(scriptPath);
  console.log(`  검증 대상: ${filename}\n`);

  // 1. 주장 추출
  const claims = extractClaims(scriptJson);
  console.log(`  추출된 주장: ${claims.length}개`);

  // 2. 각 주장 검증
  const verificationResults = [];
  for (const item of claims) {
    console.log(`\n  검증 중: "${item.claim.substring(0, 60)}..."`);

    let result;
    if (item.providedPmid) {
      // PMID 있으면 직접 검증
      result = await verifyByPmid(item.providedPmid, item.claim);
    } else {
      // PMID 없으면 재검색
      result = await verifyBySearch(item.claim);
    }

    verificationResults.push({
      claim: item.claim,
      providedSource: item.providedSource,
      verification: result,
    });

    console.log(`    ${result.status}: ${result.note}`);
  }

  // 3. 위험 표현 스캔
  const redFlags = scanRedFlags(scriptJson);

  // 4. 종합 판정
  const verifiedCount = verificationResults.filter(r =>
    r.verification.status === VERIFICATION_STATUS.VERIFIED
  ).length;
  const unverifiedCount = verificationResults.filter(r =>
    r.verification.status === VERIFICATION_STATUS.UNVERIFIED
  ).length;

  let overallStatus;
  if (unverifiedCount > 0 || redFlags.length > 0) {
    overallStatus = '❌ 수정 필요 — 미검증 주장 또는 위험 표현 발견';
  } else if (verifiedCount === verificationResults.length) {
    overallStatus = '✅ 승인 가능 — 모든 주장 검증 완료';
  } else {
    overallStatus = '🟡 조건부 승인 — 부분 검증, 수동 확인 권장';
  }

  // 5. 리포트 저장
  const report = {
    checkedAt: new Date().toISOString(),
    scriptFile: filename,
    overallStatus,
    summary: {
      totalClaims: claims.length,
      verified: verifiedCount,
      partial: verificationResults.filter(r => r.verification.status === VERIFICATION_STATUS.PARTIAL).length,
      unverified: unverifiedCount,
      redFlags: redFlags.length,
    },
    verificationResults,
    redFlags,
    // 승인된 출처 목록 (Description에 바로 붙여넣기용)
    approvedCitations: verificationResults
      .filter(r => r.verification.status === VERIFICATION_STATUS.VERIFIED)
      .map(r => r.providedSource),
  };

  const outputDir = path.join(__dirname, '../output/factcheck');
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `factcheck-${filename}`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 6. 콘솔 요약
  console.log('\n' + '─'.repeat(50));
  console.log(`\n📋 팩트체크 결과: ${overallStatus}`);
  console.log(`   ✅ 검증됨: ${report.summary.verified}개`);
  console.log(`   🟡 부분 검증: ${report.summary.partial}개`);
  console.log(`   ❌ 미검증: ${report.summary.unverified}개`);
  if (redFlags.length > 0) {
    console.log(`\n⚠️  위험 표현 발견:`);
    redFlags.forEach(f => console.log(`   - ${f.reason}: "${f.example}"`));
  }
  console.log(`\n📁 리포트 저장: ${reportPath}`);
  console.log('\n👤 【당신의 검토 필요】 위 결과를 확인 후 Stage 4 진행하세요.');

  return report;
}

if (require.main === module) {
  runFactCheck().catch(console.error);
}

module.exports = { runFactCheck };
