// ============================================================
//  STAGE 1: RESEARCH FETCHER
//  PubMed에서 최신 논문을 자동 수집하고 요약본을 만든다
//  실행: node stage1-research/pubmed-fetcher.js
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ── XML 파싱 (외부 라이브러리 없이 간단 처리) ────────────
function extractBetweenTags(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].replace(/<[^>]+>/g, '').trim());
  }
  return matches;
}

// ── PubMed 논문 ID 검색 ───────────────────────────────────
async function searchPubMed(searchTerm, maxResults = 5) {
  const apiKeyParam = config.pubmed.apiKey ? `&api_key=${config.pubmed.apiKey}` : '';
  
  // 최근 2년 논문만 (신뢰성 + 최신성)
  const dateFilter = '&datetype=pdat&reldate=730';
  
  const url = `${config.pubmed.baseUrl}/esearch.fcgi`
    + `?db=pubmed`
    + `&term=${encodeURIComponent(searchTerm)}`
    + `&retmax=${maxResults}`
    + `&sort=relevance`
    + `&retmode=json`
    + dateFilter
    + apiKeyParam;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`PubMed search failed: ${response.status}`);
  
  const data = await response.json();
  return data.esearchresult?.idlist || [];
}

// ── 논문 상세 정보 가져오기 ──────────────────────────────
async function fetchArticleDetails(pmids) {
  if (pmids.length === 0) return [];
  
  const apiKeyParam = config.pubmed.apiKey ? `&api_key=${config.pubmed.apiKey}` : '';
  const url = `${config.pubmed.baseUrl}/efetch.fcgi`
    + `?db=pubmed`
    + `&id=${pmids.join(',')}`
    + `&retmode=xml`
    + `&rettype=abstract`
    + apiKeyParam;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`PubMed fetch failed: ${response.status}`);
  
  const xml = await response.text();
  
  // 각 논문 파싱
  const articles = [];
  const articleBlocks = xml.split('<PubmedArticle>').slice(1);
  
  for (const block of articleBlocks) {
    try {
      const pmid = extractBetweenTags(block, 'PMID')[0] || '';
      const title = extractBetweenTags(block, 'ArticleTitle')[0] || '';
      const abstracts = extractBetweenTags(block, 'AbstractText');
      const abstract = abstracts.join(' ') || '';
      const journal = extractBetweenTags(block, 'Title')[0] || '';
      const year = extractBetweenTags(block, 'Year')[0] || '';
      const authors = extractBetweenTags(block, 'LastName').slice(0, 3);
      const authorStr = authors.length > 0
        ? `${authors.join(', ')}${authors.length >= 3 ? ' et al.' : ''}`
        : '';

      if (title && abstract.length > 100) {
        articles.push({
          pmid,
          title: title.replace(/\[|\]/g, ''),
          abstract: abstract.substring(0, 800) + (abstract.length > 800 ? '...' : ''),
          journal,
          year,
          authors: authorStr,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          citation: `${authorStr} (${year}). ${title}. ${journal}. PMID: ${pmid}`,
        });
      }
    } catch (e) {
      // 파싱 실패한 개별 논문은 스킵
    }
  }
  
  return articles;
}

// ── 전체 검색 실행 ────────────────────────────────────────
async function runResearchFetch() {
  console.log('🔬 Stage 1: PubMed 논문 수집 시작...\n');
  
  const allArticles = [];
  const errors = [];

  for (const term of config.pubmed.searchTerms) {
    try {
      console.log(`  검색 중: "${term}"`);
      
      // PubMed API 속도 제한 준수 (무료: 3req/sec)
      await new Promise(r => setTimeout(r, 400));
      
      const pmids = await searchPubMed(term, config.pubmed.maxResults);
      if (pmids.length === 0) {
        console.log(`    → 결과 없음`);
        continue;
      }
      
      await new Promise(r => setTimeout(r, 400));
      const articles = await fetchArticleDetails(pmids);
      
      // 중복 제거 (같은 PMID)
      for (const article of articles) {
        if (!allArticles.find(a => a.pmid === article.pmid)) {
          article.searchTerm = term;
          allArticles.push(article);
        }
      }
      
      console.log(`    → ${articles.length}개 논문 수집`);
      
    } catch (err) {
      errors.push({ term, error: err.message });
      console.log(`    ⚠️  오류: ${err.message}`);
    }
  }

  // ── 결과 저장 ─────────────────────────────────────────
  const outputDir = path.join(__dirname, '../output/research');
  fs.mkdirSync(outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().split('T')[0];
  const outputPath = path.join(outputDir, `research-${timestamp}.json`);
  
  const result = {
    fetchedAt: new Date().toISOString(),
    totalArticles: allArticles.length,
    errors: errors.length,
    articles: allArticles,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  
  console.log(`\n✅ 완료: ${allArticles.length}개 논문 수집`);
  console.log(`📁 저장: ${outputPath}`);
  if (errors.length > 0) {
    console.log(`⚠️  오류 ${errors.length}건:`, errors);
  }
  
  return result;
}

// 직접 실행 시
if (require.main === module) {
  runResearchFetch().catch(console.error);
}

module.exports = { runResearchFetch, searchPubMed, fetchArticleDetails };
