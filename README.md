# Brain Content Pipeline — 클라우드 서버 운영 가이드
## 스택: AWS Lightsail(서버) + n8n(자동화) + Claude/GPT(스크립트) + OpenAI TTS + Remotion(영상)
## GitHub: https://github.com/SanhoLee/Brain50

---

## 전체 구조 이해 (가장 먼저 읽을 것)

```
┌─────────────────────────────────────────────────────────┐
│  내 Windows PC (설정할 때만 사용, 평소엔 꺼도 됨)         │
│  - SSH로 서버 접속                                        │
│  - GitHub에 코드 push                                    │
│  - Telegram으로 파이프라인 상태 확인 및 명령              │
└───────────────┬─────────────────────────────────────────┘
                │ SSH 접속 (설정시만)
                ▼
┌─────────────────────────────────────────────────────────┐
│  AWS Lightsail 서버 $5/월 (24시간 365일 실행)             │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  n8n (자동화 엔진) — 매주 월요일 06:00 자동 실행  │    │
│  └────────────────────┬────────────────────────────┘    │
│                        │                                 │
│  Stage 1: PubMed 논문 수집 (자동)                        │
│  Stage 2: Claude/GPT 스크립트 생성 (자동)                │
│  Stage 3: 팩트체크 + 위험표현 스캔 (자동)                │
│  Stage 4: OpenAI TTS 음성 생성 (자동)                    │
│  Stage 5: Remotion 영상 합성 (자동)                      │
│  Stage 6: YouTube 예약 업로드 (자동)                     │
└─────────────────────────────────────────────────────────┘
                        │ Telegram 알림
                        ▼
┌─────────────────────────────────────────────────────────┐
│  내 스마트폰 Telegram                                     │
│  - 파이프라인 완료 알림 수신                              │
│  - /run /status /logs 명령어로 원격 제어                 │
└─────────────────────────────────────────────────────────┘
```

**핵심 원칙:** 모든 코드와 설정은 서버에 있습니다. 내 PC는 최초 설정할 때만 씁니다.

---

## 월 예상 비용

| 항목 | 비용 | 비고 |
|---|---|---|
| AWS Lightsail 서버 | $5/월 | n8n + 파이프라인 실행 |
| Anthropic API | ~$3/월 | 롱폼 스크립트 |
| OpenAI API (GPT + TTS) | ~$5/월 | 숏폼 + 음성 |
| Remotion | 무료 | 개발자 라이선스 |
| YouTube / PubMed API | 무료 | |
| Telegram Bot | 무료 | |
| **합계** | **~$13/월** | |

---

## ✅ 전체 설정 체크리스트 (현재 진행 상황)

> 마지막 업데이트: 2026-05-31

### PHASE 1: 클라우드 서버
- [x] **AWS 계정 생성** — 완료
- [x] **Lightsail 서버 생성** — 완료 (할당량 lock → 해제 리퀘스트 완료)
- [ ] Lightsail 방화벽 포트 5678 개방
- [ ] SSH 키 다운로드 및 내 PC에 저장

### PHASE 2: 서버 접속
- [ ] SSH 키 파일 권한 설정 (PowerShell icacls)
- [ ] PowerShell로 서버 SSH 접속 성공

### PHASE 3: 서버 프로그램 설치
- [ ] Node.js 설치 (v20.x)
- [ ] Docker 설치
- [ ] n8n Docker 실행
- [ ] 브라우저에서 n8n 접속 확인 (http://서버IP:5678)
- [ ] 파이프라인 코드 서버 업로드 (scp)
- [ ] npm install dotenv

### PHASE 4: API 키 설정
- [x] **Anthropic API 키 발급** — 완료
- [x] **PubMed API 키 발급** — 완료
- [x] **YouTube OAuth 클라이언트 생성** — 완료 (웹 애플리케이션, n8n-유튜브-연동)
- [x] **리디렉션 URI 설정** — 완료 (http://localhost)
- [x] **클라이언트 보안 비밀 JSON 다운로드** — 완료
- [ ] **YouTube Refresh Token 발급** — 미완료 ← 다음 단계
- [ ] OpenAI API 키 발급
- [ ] 서버 .env 파일 작성

### PHASE 5: Telegram 봇
- [ ] BotFather로 봇 생성
- [ ] Bot Token 발급
- [ ] 내 Chat ID 확인
- [ ] 봇 서버에서 실행 (nohup)
- [ ] /help 명령어 응답 확인

### PHASE 6: n8n 자동화
- [ ] n8n에 워크플로우 임포트 (workflow.json)
- [ ] Credentials 설정 (Anthropic, OpenAI)
- [ ] 워크플로우 Active 전환

### PHASE 7: 첫 번째 테스트
- [ ] Stage 1 단독 테스트 (pubmed-fetcher.js)
- [ ] Stage 1~2 테스트 (스크립트 생성 확인)
- [ ] 전체 파이프라인 테스트
- [ ] Telegram 알림 수신 확인

---

## 지금 바로 해야 할 것 — YouTube Refresh Token 발급

체크리스트 기준으로 **다음 단계는 YouTube Refresh Token 발급**입니다.

### 순서

**Step 1 — Chrome 주소창에 붙여넣기 (CLIENT_ID 교체)**

다운받은 JSON 파일을 메모장으로 열면 `client_id` 값이 있습니다. 그 값으로 교체:

```
https://accounts.google.com/o/oauth2/auth?client_id=CLIENT_ID여기교체&redirect_uri=http://localhost&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline&prompt=consent
```

**Step 2 — 허용 후 주소창에서 code 복사**

브라우저가 "사이트에 연결할 수 없음"으로 이동 → 정상!
주소창: `http://localhost/?code=4/0AX4xxxxx&scope=...`
`code=` 뒤부터 `&scope` 앞까지 복사

**Step 3 — PowerShell에서 Refresh Token 교환**

```powershell
$body = "client_id=CLIENT_ID입력&client_secret=CLIENT_SECRET입력&code=복사한코드&grant_type=authorization_code&redirect_uri=http://localhost"
$r = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method POST -Body $body -ContentType "application/x-www-form-urlencoded"
$r.refresh_token
```

출력된 값 → 나중에 서버 `.env`의 `YOUTUBE_REFRESH_TOKEN=` 에 입력

---

## PHASE 3: 서버에 프로그램 설치 (SSH 접속 상태에서)

### 3-1. 기본 패키지 업데이트

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### 3-2. Node.js 설치

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 확인 (v20.x 이상 나오면 성공)
node --version
npm --version
```

### 3-3. Docker 설치

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
docker --version
```

### 3-4. n8n 실행

```bash
# 비밀번호는 본인이 원하는 것으로 교체
docker run -d \
  --name n8n \
  --restart always \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=내비밀번호 \
  -e GENERIC_TIMEZONE=Asia/Seoul \
  n8nio/n8n

docker ps
```

브라우저에서 `http://서버IP:5678` → n8n 로그인 화면 = 성공

### 3-5. GitHub에서 서버로 코드 받기

> GitHub(SanhoLee/Brain50)에 코드가 있으므로 scp 대신 git clone 사용 가능

```bash
# 서버에서 실행
cd ~
git clone https://github.com/SanhoLee/Brain50.git brain-pipeline
cd brain-pipeline
npm install dotenv
ls
```

---

## PHASE 4: API 키 서버에 설정

```bash
cd ~/brain-pipeline
nano .env
```

아래 내용 입력 (`Ctrl+O` → Enter → `Ctrl+X` 저장):

```
ANTHROPIC_API_KEY=sk-ant-여기에입력
OPENAI_API_KEY=sk-여기에입력
YOUTUBE_CLIENT_ID=여기에입력.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=여기에입력
YOUTUBE_REFRESH_TOKEN=여기에입력
PUBMED_API_KEY=여기에입력
TELEGRAM_BOT_TOKEN=여기에입력
TELEGRAM_CHAT_ID=여기에입력
DEFAULT_LLM=anthropic
TTS_ENGINE=openai
VIDEO_ENGINE=remotion
CHANNEL_LANGUAGE=ko
```

> ⚠️ .env 파일은 GitHub에 올리지 않습니다 (.gitignore에 포함됨)

### API 키 발급 현황

| API | 상태 | 발급 위치 |
|---|---|---|
| Anthropic | ✅ 완료 | https://console.anthropic.com |
| PubMed | ✅ 완료 | https://www.ncbi.nlm.nih.gov/account |
| YouTube OAuth | ✅ 클라이언트 완료 | Google Cloud Console |
| YouTube Refresh Token | ⏳ 진행 중 | 위 단계 참고 |
| OpenAI | ❌ 미완료 | https://platform.openai.com |

### OpenAI API 키 발급

1. https://platform.openai.com 로그인
2. 우측 상단 프로필 → API keys → Create new secret key → 복사
3. Settings → Billing → $10 충전

---

## PHASE 5: Telegram 봇 설정 (약 10분)

### 5-1. 봇 만들기

1. Telegram 앱 → **@BotFather** 검색 → 채팅 시작
2. `/newbot` 입력
3. 봇 이름: `BrainPipelineBot`
4. 봇 사용자명: `내이름_brain_bot` (_bot으로 끝나야 함)
5. **Token 복사** → `.env`의 `TELEGRAM_BOT_TOKEN`에 입력

### 5-2. 내 Chat ID 확인

1. Telegram → **@userinfobot** 검색 → `/start`
2. 숫자 Id 복사 → `.env`의 `TELEGRAM_CHAT_ID`에 입력

### 5-3. 봇 서버에서 실행

```bash
cd ~/brain-pipeline
mkdir -p logs
nohup node telegram-bot.js > logs/telegram-bot.log 2>&1 &
ps aux | grep telegram
```

Telegram에서 본인 봇에 `/help` → 명령어 목록이 오면 성공!

### 5-4. 자동 재시작 설정 (서버 재부팅 시)

```bash
crontab -e
```

맨 아래에 추가:

```
@reboot cd ~/brain-pipeline && nohup node telegram-bot.js > logs/telegram-bot.log 2>&1 &
0 6 * * 1 cd ~/brain-pipeline && node run-pipeline.js >> logs/cron.log 2>&1
```

`Ctrl+O` → Enter → `Ctrl+X`

---

## PHASE 6: n8n 워크플로우 설정

1. `http://서버IP:5678` → 로그인
2. Workflows → "+ New Workflow"
3. "..." → "Import from File" → `n8n/workflow.json` 업로드
4. Credentials 설정:

```
Settings → Credentials → Add:

1. Anthropic: HTTP Header Auth
   Name: x-api-key
   Value: sk-ant-xxxxx

2. OpenAI: HTTP Header Auth
   Name: Authorization
   Value: Bearer sk-xxxxx
```

5. 워크플로우 토글 → **Active** → 저장

---

## PHASE 7: 첫 번째 테스트

```bash
cd ~/brain-pipeline

# Stage 1 테스트 (API 키 없이 가능)
node stage1-research/pubmed-fetcher.js
ls output/research/

# Stage 1~2 테스트
node run-pipeline.js --stage=1,2
ls output/scripts/

# 전체 실행
node run-pipeline.js
```

Telegram 알림이 오면 완전히 성공!

---

## 운영 중 자주 쓰는 명령어

### 서버 접속 (내 PC PowerShell)
```powershell
ssh -i "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-northeast-1.pem" ubuntu@서버IP
```

### 코드 업데이트 (서버에서)
```bash
cd ~/brain-pipeline
git pull origin main
```

### 상태 확인 (서버에서)
```bash
docker ps                          # n8n 실행 확인
tail -f logs/cron.log              # 파이프라인 로그
tail -f logs/telegram-bot.log      # 봇 로그
```

### Telegram 명령어
```
/run     → 파이프라인 즉시 실행
/status  → 현재 상태
/logs    → 최근 로그
/help    → 명령어 목록
```

---

## 자주 발생하는 오류

| 오류 | 원인 | 해결 |
|---|---|---|
| SSH 접속 안 됨 | 키 파일 권한 문제 | icacls 명령어 재실행 |
| n8n 접속 안 됨 | 방화벽 포트 미개방 | Lightsail 네트워킹 → 5678 포트 확인 |
| PubMed 결과 없음 | 속도 제한 | PUBMED_API_KEY 설정 확인 |
| Telegram 알림 없음 | TOKEN 또는 CHAT_ID 오류 | .env 파일 재확인 |
| YouTube 업로드 실패 | Refresh Token 만료 | PHASE 4 YouTube 단계 재실행 |
