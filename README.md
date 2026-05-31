# Brain Content Pipeline — 클라우드 서버 운영 가이드
## 스택: AWS Lightsail(서버) + n8n(자동화) + Claude/GPT(스크립트) + OpenAI TTS + Remotion(영상)

---

## 전체 구조 이해 (가장 먼저 읽을 것)

```
┌─────────────────────────────────────────────────────────┐
│  내 Windows PC (설정할 때만 사용, 평소엔 꺼도 됨)         │
│  - SSH로 서버 접속                                        │
│  - 파일 업로드 (최초 1회)                                 │
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

## 설정 순서 (이 순서대로 진행할 것)

```
PHASE 1: 클라우드 서버 만들기       ← AWS에서 서버 생성
PHASE 2: 서버 접속하기              ← 내 PC에서 SSH
PHASE 3: 서버에 프로그램 설치       ← 서버에서 명령어 실행
PHASE 4: API 키 서버에 설정         ← 서버 .env 파일 작성
PHASE 5: Telegram 봇 설정           ← 알림 + 명령 수신
PHASE 6: n8n 자동화 설정            ← 브라우저에서 워크플로우 임포트
PHASE 7: 첫 번째 테스트             ← 서버에서 파이프라인 실행
```

---

## PHASE 1: 클라우드 서버 만들기

### 1-1. AWS 계정 만들기 (최초 1회, 약 5분)

1. https://aws.amazon.com 접속 → "AWS 계정 생성" 클릭
2. 이메일 / 비밀번호 / 계정 이름 입력
3. 신용카드 입력 (즉시 청구 안 됨, $5 이상 나오지 않음)
4. 휴대폰 문자 인증 → 지원 플랜: **기본 무료** 선택
5. 가입 완료 → AWS Management Console 로그인

### 1-2. Lightsail 서버 생성 (약 5분)

1. AWS Console 상단 검색창 → `Lightsail` 입력 → 클릭
2. "인스턴스 생성" 클릭
3. 설정:
   - 인스턴스 위치: **도쿄 (ap-northeast-1)** (한국에서 가장 빠름)
   - 플랫폼: **Linux/Unix**
   - 블루프린트: **OS만 (OS Only)** → **Ubuntu 22.04 LTS**
   - 플랜: **$5/월 (1GB RAM, 40GB SSD)**
   - 인스턴스 이름: `brain-pipeline`
4. "인스턴스 생성" 클릭 → 약 1~2분 후 "실행 중" 확인
5. **IP 주소 메모** (예: 12.34.56.78) — 이후 계속 사용

### 1-3. 방화벽 포트 열기 (약 2분)

1. brain-pipeline 인스턴스 클릭 → **"네트워킹"** 탭
2. IPv4 방화벽 → "규칙 추가"
3. 설정: 애플리케이션=사용자 지정 / 프로토콜=TCP / 포트=`5678`
4. "저장"

---

## PHASE 2: 서버 접속하기 (내 Windows PC에서)

### 2-1. SSH 키 다운로드

1. Lightsail 홈 → 우측 상단 계정 아이콘 → **"SSH 키"**
2. 기본 키 옆 **"다운로드"** → `.pem` 파일 저장
3. 파일을 `C:\Users\[내이름]\.ssh\` 폴더로 이동

> ⚠️ .pem 파일은 절대 외부 공유 금지

### 2-2. PowerShell로 서버 접속

**시작 메뉴 → PowerShell → 관리자 권한으로 실행**

```powershell
# 키 파일 권한 설정 (최초 1회)
icacls "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-northeast-1.pem" /inheritance:r /grant:r "$env:USERNAME:R"

# 서버 접속 (IP는 본인 것으로 교체)
ssh -i "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-northeast-1.pem" ubuntu@12.34.56.78
```

"Are you sure...?" → `yes` 입력

`ubuntu@ip-xxx:~$` 가 나오면 **서버 접속 성공!**

> 이후 모든 명령어는 이 SSH 창에서 실행합니다 (서버에서 실행)

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

# 확인
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

# 실행 확인
docker ps
```

브라우저에서 `http://서버IP:5678` 접속 → n8n 로그인 화면 나오면 성공!

### 3-5. 파이프라인 코드 서버에 업로드

**새 PowerShell 창에서** (기존 SSH 창은 그대로 유지):

```powershell
# 내 PC → 서버로 파일 업로드 (경로와 IP는 본인 것으로 교체)
scp -i "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-northeast-1.pem" -r `
  "C:\Users\내이름\brain-pipeline-v2\*" `
  ubuntu@12.34.56.78:~/brain-pipeline/
```

**서버 SSH 창으로 돌아와서:**

```bash
cd ~/brain-pipeline
npm install dotenv
ls   # 파일들이 업로드됐는지 확인
```

---

## PHASE 4: API 키 서버에 설정

> 모든 API 키는 서버의 `.env` 파일에 저장합니다 (내 PC가 아닙니다!)

```bash
# 서버에서 실행
cd ~/brain-pipeline
nano .env
```

아래 내용을 입력 후 `Ctrl+O` → Enter → `Ctrl+X` 로 저장:

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

### 4-1. Anthropic API 키 발급

1. https://console.anthropic.com 로그인
2. API Keys → Create Key → 복사
3. Settings → Billing → $10~20 충전

### 4-2. OpenAI API 키 발급

1. https://platform.openai.com 로그인
2. 우측 상단 프로필 → API keys → Create new secret key → 복사
3. Settings → Billing → $10 충전

### 4-3. PubMed API 키 발급 (선택사항 — 없으면 속도 느림)

- 없어도 동작하지만 논문 수집 속도가 3배 느려집니다 (3→10 req/sec)
1. https://www.ncbi.nlm.nih.gov/account/ 회원가입
2. Settings → API Key Management → Create API Key → 복사

### 4-4. YouTube API 설정 (가장 복잡, 약 40분)

**4-4-1. Google Cloud 설정:**
1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성 → 이름: `brain-pipeline`
3. API 및 서비스 → 라이브러리 → "YouTube Data API v3" → 사용 설정
4. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기
   - 유형: **데스크톱 앱**
   - 클라이언트 ID, 보안 비밀 복사

**4-4-2. OAuth 동의 화면:**
1. OAuth 동의 화면 → 외부 → 앱 만들기
2. 앱 이름 입력 → 테스트 사용자에 본인 Gmail 추가

**4-4-3. Refresh Token 발급 (내 PC PowerShell에서):**

```powershell
# Chrome에서 아래 URL 접속 (CLIENT_ID 교체)
# https://accounts.google.com/o/oauth2/auth?client_id=CLIENT_ID입력&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code

# 허용 후 나온 코드로 토큰 교환
$body = "client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code=인증코드&grant_type=authorization_code&redirect_uri=urn:ietf:wg:oauth:2.0:oob"
$r = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method POST -Body $body -ContentType "application/x-www-form-urlencoded"
$r.refresh_token   # 이 값을 .env의 YOUTUBE_REFRESH_TOKEN에 입력
```

---

## PHASE 5: Telegram 봇 설정 (약 10분)

> Telegram은 Slack 대신 사용합니다. **완전 무료 + 양방향 명령 전달 가능**

### 5-1. 봇 만들기

1. Telegram 앱에서 **@BotFather** 검색 → 채팅
2. `/newbot` 입력
3. 봇 이름 입력 (예: `BrainPipelineBot`)
4. 봇 사용자명 입력 (영어, _bot으로 끝나야 함, 예: `my_brain_pipeline_bot`)
5. **Token 복사** → `.env`의 `TELEGRAM_BOT_TOKEN`에 입력

### 5-2. 내 Chat ID 확인

1. Telegram에서 **@userinfobot** 검색 → `/start` 입력
2. 숫자로 된 **Id** 값 복사 → `.env`의 `TELEGRAM_CHAT_ID`에 입력

### 5-3. 봇 서버에서 실행

```bash
# 서버 SSH에서 실행
cd ~/brain-pipeline

# 봇 백그라운드 실행
nohup node telegram-bot.js > logs/telegram-bot.log 2>&1 &

# 실행 확인
ps aux | grep telegram
```

Telegram에서 본인 봇에 `/help` 입력 → 명령어 목록이 오면 성공!

### 5-4. 서버 재시작 시 자동 실행 설정

```bash
# crontab 설정
crontab -e

# 아래 줄 추가 (파일 맨 아래에)
@reboot cd ~/brain-pipeline && nohup node telegram-bot.js > logs/telegram-bot.log 2>&1 &
@reboot cd ~/brain-pipeline && nohup node run-pipeline.js >> logs/cron.log 2>&1

# 매주 월요일 오전 6시 파이프라인 자동 실행
0 6 * * 1 cd ~/brain-pipeline && node run-pipeline.js >> logs/cron.log 2>&1
```

`Ctrl+O` → Enter → `Ctrl+X` 로 저장

---

## PHASE 6: n8n 워크플로우 설정 (약 15분)

1. 브라우저에서 `http://서버IP:5678` → 로그인
2. Workflows → "+ New Workflow"
3. 우측 상단 "..." → "Import from File"
4. 내 PC의 `brain-pipeline-v2\n8n\workflow.json` 업로드
5. 각 노드 Credentials 설정:

```
Settings → Credentials → Add:

1. Anthropic: HTTP Header Auth
   Name: x-api-key / Value: sk-ant-xxxxx

2. OpenAI: HTTP Header Auth
   Name: Authorization / Value: Bearer sk-xxxxx
```

6. 워크플로우 우측 상단 토글 → **"Active"** 전환 → 저장

---

## PHASE 7: 첫 번째 테스트 (서버 SSH에서)

```bash
cd ~/brain-pipeline

# Stage 1만 테스트 (API 키 불필요)
node stage1-research/pubmed-fetcher.js
ls output/research/   # JSON 파일 생성 확인

# Stage 1~2 테스트 (Anthropic/OpenAI 키 필요)
node run-pipeline.js --stage=1,2
ls output/scripts/    # 스크립트 파일 생성 확인

# 전체 파이프라인 테스트
node run-pipeline.js
```

Telegram으로 알림이 오면 전체 설정 완료!

---

## 운영 중 자주 쓰는 명령어

### 서버 SSH 접속 (내 PC PowerShell에서)
```powershell
ssh -i "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-northeast-1.pem" ubuntu@서버IP
```

### 서버 상태 확인
```bash
# n8n 실행 중인지 확인
docker ps

# 파이프라인 로그 확인
tail -f ~/brain-pipeline/logs/cron.log

# Telegram 봇 로그
tail -f ~/brain-pipeline/logs/telegram-bot.log
```

### Telegram으로 원격 제어
```
/run      → 파이프라인 즉시 실행
/status   → 현재 상태 확인
/logs     → 최근 실행 로그
/help     → 명령어 목록
```

### 코드 수정 후 서버 재업로드 (내 PC PowerShell에서)
```powershell
scp -i "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-northeast-1.pem" `
  "C:\Users\내이름\brain-pipeline-v2\수정한파일.js" `
  ubuntu@서버IP:~/brain-pipeline/
```

---

## 자주 발생하는 오류

| 오류 | 원인 | 해결 |
|---|---|---|
| SSH 접속 안 됨 | 키 파일 권한 문제 | icacls 명령어 재실행 |
| n8n 접속 안 됨 | 방화벽 포트 미개방 | Lightsail 네트워킹 → 5678 포트 확인 |
| PubMed 결과 없음 | API 속도 제한 | PUBMED_API_KEY 설정 또는 딜레이 증가 |
| Telegram 알림 없음 | BOT_TOKEN 또는 CHAT_ID 오류 | .env 파일 재확인 |
| YouTube 업로드 실패 | Refresh Token 만료 | PHASE 4-4-3 재실행 |

