# Brain Content Pipeline — 설정 가이드

## 전체 구조

```
파이프라인 자동 실행 흐름
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[매주 월요일 오전 6시 자동 시작]
        ↓
Stage 1: PubMed 논문 수집         ← 자동 (당신 개입 없음)
        ↓
Stage 2: Claude 스크립트 생성      ← 자동
        ↓
Stage 3: 위험표현 스캔             ← 자동
        ↓
   [위험표현 발견?]
   YES → Slack 경고 → 당신이 수정
   NO  ↓
Stage 4: ElevenLabs 음성 생성     ← 자동
        ↓
Slack 알림 → 당신에게 검토 요청   ← 👤 당신 개입 (15~20분)
        ↓
[Pictory/Invideo 영상 합성]        ← 당신이 클릭 몇 번
        ↓
Stage 5: YouTube 예약 업로드       ← 자동
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 셋업 작업 목록

### ✅ 내가 이미 만들어 놓은 것
- `config.js` — 전체 설정 파일
- `stage1-research/pubmed-fetcher.js` — PubMed 자동 수집
- `stage2-script/claude-script-generator.js` — Claude 스크립트 생성
- `stage3-factcheck/fact-checker.js` — 팩트체크 자동화
- `stage4-voice/voice-generator.js` — ElevenLabs 음성 생성
- `stage5-youtube/youtube-uploader.js` — YouTube 업로드
- `run-pipeline.js` — 전체 파이프라인 실행기
- `n8n/workflow.json` — n8n 비주얼 워크플로우 (임포트용)

---

## 👤 당신이 설정해야 할 것 (단계별)

---

### STEP 1: 기본 환경 설치 (30분)

```bash
# Node.js 설치 (https://nodejs.org — LTS 버전)
node --version  # v18 이상 확인

# 프로젝트 디렉토리에서 실행
cd brain-content-pipeline
npm init -y
```

---

### STEP 2: Anthropic API 키 발급 (10분)

1. https://console.anthropic.com 접속
2. API Keys → Create Key
3. 키 복사 후 환경변수 설정:

```bash
# Mac/Linux
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"

# Windows PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
```

**예상 비용:** 스크립트 1개당 약 $0.01~0.03 (월 $2~5 수준)

---

### STEP 3: ElevenLabs 계정 & 목소리 설정 (20분)

1. https://elevenlabs.io 가입 (무료 플랜 시작 가능)
2. API Keys에서 키 복사
3. Voice Library에서 목소리 선택:
   - 추천: "한국어 지원 남성 목소리" 검색
   - 또는 Voice Cloning으로 자신의 목소리 복제
4. 선택한 목소리의 Voice ID 복사 (URL에서 확인)

```bash
export ELEVENLABS_API_KEY="your_key"
export ELEVENLABS_VOICE_ID="your_voice_id"
```

**config.js에서 voiceId 수정:**
```javascript
voiceId: 'YOUR_VOICE_ID_HERE',
```

**예상 비용:** Starter 플랜 $5/월 (월 30,000자 포함, 숏폼 약 30개)

---

### STEP 4: YouTube Data API 설정 (40분 — 가장 복잡)

#### 4-1. Google Cloud Console 설정
1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성 ("brain-content-pipeline")
3. API 및 서비스 → 라이브러리 → "YouTube Data API v3" 검색 → 사용 설정
4. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기
   - 애플리케이션 유형: 데스크톱 앱
   - 클라이언트 ID, 클라이언트 보안 비밀 복사

#### 4-2. Refresh Token 발급
```bash
# 브라우저에서 아래 URL 접속 (client_id 교체)
https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code

# 표시된 코드로 토큰 교환
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_AUTH_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"

# 응답에서 refresh_token 복사
```

```bash
export YOUTUBE_CLIENT_ID="your_client_id"
export YOUTUBE_CLIENT_SECRET="your_client_secret"
export YOUTUBE_REFRESH_TOKEN="your_refresh_token"
```

---

### STEP 5: PubMed API 키 발급 (선택사항, 10분)

- 없어도 동작하지만 속도 제한이 있음 (3req/sec → 10req/sec)
- https://www.ncbi.nlm.nih.gov/account/ 가입 → API Key 발급

```bash
export PUBMED_API_KEY="your_pubmed_key"
```

---

### STEP 6: Slack 알림 설정 (10분)

1. https://api.slack.com/apps → 새 앱 만들기
2. Incoming Webhooks 활성화
3. 채널 선택 후 Webhook URL 복사
4. `n8n/workflow.json`에서 `YOUR_SLACK_WEBHOOK_URL` 교체

---

### STEP 7: n8n 설치 & 워크플로우 임포트 (30분)

#### 옵션 A: n8n Cloud (가장 쉬움, $20/월)
1. https://n8n.io 가입
2. 새 워크플로우 → Import → `n8n/workflow.json` 업로드

#### 옵션 B: 자체 서버 (무료)
```bash
# Docker로 실행
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# 접속: http://localhost:5678
```

#### n8n에서 Credentials 설정
1. Settings → Credentials → Add
2. "HTTP Header Auth" 타입으로 각각 추가:
   - `Anthropic API Key`: Header = `x-api-key`, Value = 키 값
   - `ElevenLabs API Key`: Header = `xi-api-key`, Value = 키 값
3. `workflow.json`의 `YOUR_VOICE_ID` → 실제 Voice ID로 교체

---

### STEP 8: 영상 합성 도구 설정 (Pictory 추천)

**Pictory (추천, $19/월)**
1. https://pictory.ai 가입
2. Script to Video 기능 사용
3. output/audio/의 MP3 + 스크립트 텍스트 입력
4. 자동 스톡 영상 매칭 → 완성 영상 다운로드
5. output/video/에 저장

**대안: Invideo AI ($20/월)**
- 비슷한 방식, UI가 더 직관적

---

### STEP 9: 첫 번째 테스트 실행

```bash
# Stage 1만 테스트 (API 키 없이 가능)
node stage1-research/pubmed-fetcher.js

# Stage 1~2 테스트
node run-pipeline.js --stage=1,2

# 전체 실행
node run-pipeline.js
```

---

## 비용 요약

| 서비스 | 플랜 | 월 비용 |
|---|---|---|
| Anthropic API | 사용량 기반 | $3~8 |
| ElevenLabs | Starter | $5 |
| Pictory | Basic | $19 |
| n8n | Cloud Starter | $20 (자체 서버 시 $0) |
| YouTube API | 무료 | $0 |
| PubMed API | 무료 | $0 |
| **합계** | | **$27~52/월** |

---

## 실행 후 당신이 하는 일 (주 3~4시간)

```
월요일 오전: Slack 알림 확인 (5분)
          ↓
         스크립트 내용 검토 — 사실 오류 체크 (15~20분)
          ↓
         Pictory에서 영상 합성 클릭 (10분)
          ↓
수요일/금요일: 같은 과정 반복
          ↓
         YouTube Studio에서 예약 발행 확인 (5분)
```

---

## 문제 해결

**PubMed 결과 없음:**
- `config.js`의 `searchTerms` 영어로 설정 확인
- VPN 사용 시 접속 차단될 수 있음

**Claude API 오류:**
- API 키 확인
- 잔액 충전 (https://console.anthropic.com/billing)

**ElevenLabs 음성 품질 이슈:**
- `stability` 값 0.65~0.80 범위에서 조정
- 다른 Voice ID 시도

**YouTube 업로드 실패:**
- Refresh Token 만료 시 STEP 4-2 재실행
- OAuth 동의 화면에서 본인 Gmail 테스터로 추가 필요
