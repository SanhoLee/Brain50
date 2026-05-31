# Brain50 수동 프로토타입 튜토리얼
## 서버 없이 내 PC에서 직접 콘텐츠 만들어보기

---

## 전체 흐름

```
STEP 1: PubMed 논문 검색 + Claude 스크립트 생성
           ↓ output/scripts/날짜-shortform.json
STEP 2: Edge TTS로 음성 생성 (무료)
           ↓ output/audio/날짜-shortform.mp3
STEP 3: Remotion으로 영상 합성
           ↓ output/video/날짜-shortform.mp4
```

**총 비용: Anthropic API 호출 1회 (~$0.01) + 나머지 무료**

---

## 사전 준비 (최초 1회)

### 1. Node.js 설치 확인
```powershell
node --version   # v18 이상
npm --version
```
없으면: https://nodejs.org 에서 LTS 다운로드

### 2. Python 설치 확인
```powershell
python --version  # 3.8 이상
```
없으면: https://python.org 에서 다운로드 (설치 시 "Add to PATH" 체크 필수)

### 3. .env 파일 생성
```powershell
cd "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype"
Copy-Item .env.example .env
notepad .env
# ANTHROPIC_API_KEY= 뒤에 본인 키 입력 후 저장
```

---

## STEP 1: PubMed 크롤링 + 스크립트 생성

```powershell
cd "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\step1-research-script"

# 의존성 설치 (최초 1회)
npm install dotenv

# 실행
node run.js
```

### 실행 후 일어나는 일
1. PubMed에서 수면+치매 관련 최신 논문 3편 자동 수집
2. Claude API가 논문을 읽고 기승전결 구조 스크립트 생성
3. 결과물 저장:
   - `output/research/YYYY-MM-DD.json` — 수집된 논문
   - `output/scripts/YYYY-MM-DD-shortform.json` — 생성된 스크립트

### 검색 주제 변경하고 싶으면
`run.js` 파일에서 이 줄 수정:
```javascript
searchTerm: 'sleep duration dementia risk longitudinal',
```
예시:
- `'exercise cognitive decline elderly'` — 운동과 뇌 건강
- `'gut microbiome brain aging'` — 장-뇌 축
- `'mediterranean diet alzheimer prevention'` — 지중해식 식단

---

## STEP 2: Edge TTS 음성 생성 (무료)

```powershell
cd "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\step2-tts"

# 의존성 설치 (최초 1회)
pip install edge-tts

# 실행
python run.py
```

### 실행 후 일어나는 일
1. STEP 1에서 생성된 스크립트 자동 로드
2. Microsoft Edge TTS로 한국어 음성 생성
3. `output/audio/YYYY-MM-DD-shortform.mp3` 저장

### 목소리 바꾸고 싶으면
`run.py` 에서:
```python
"voice": "ko-KR-InJoonNeural",   # 남성 (기본)
# "voice": "ko-KR-SunHiNeural",  # 여성
# "voice": "ko-KR-HyunsuNeural", # 남성 젊은 느낌
```

### 목소리 전체 목록 보기
실행 후 "한국어 목소리 목록 보기? (y/N):" 에서 y 입력

---

## STEP 3: Remotion 영상 합성

```powershell
cd "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\step3-video"

# 의존성 설치 (최초 1회, 약 2~3분 소요)
npm install

# 브라우저 미리보기 (먼저 확인 권장)
npm run studio
# → 브라우저에서 http://localhost:3000 열림
# → 영상 미리보기 + 실시간 편집 가능

# 실제 렌더링 (mp4 파일 생성)
node render.js
```

### 실행 후 일어나는 일
1. STEP 2에서 생성된 MP3 자동 로드
2. 기승전결 섹션별 자동 자막 + 배경 + 진행바 합성
3. `output/video/YYYY-MM-DD-shortform.mp4` 저장

### 영상 커스터마이징
`src/ShortformVideo.jsx` 에서:
- 배경색: `backgroundColor: '#0D0D0D'` 변경
- 폰트 크기: `fontSize: 42` 변경
- 섹션 색상: `color: '#FF6B6B'` 등 변경

---

## 결과물 확인

```powershell
# 생성된 파일 확인
ls "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\output\research"
ls "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\output\scripts"
ls "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\output\audio"
ls "C:\Users\stlsh\Documents\dev\BrainContent_channel\Brain50\prototype\output\video"
```

---

## 자주 발생하는 오류

| 오류 | 원인 | 해결 |
|---|---|---|
| `ANTHROPIC_API_KEY is not defined` | .env 파일 없음 | .env 파일 생성 확인 |
| `pip is not recognized` | Python PATH 설정 안 됨 | Python 재설치, "Add to PATH" 체크 |
| `npm install` 후 오류 | Node.js 버전 문제 | node --version 확인, v18+ 필요 |
| PubMed 결과 없음 | 검색어 문제 | searchTerm 영어로 변경 |
| Remotion 렌더링 느림 | 정상 (1500프레임 렌더링) | 기다리면 됩니다 |

---

## 다음 단계 (서버 승인 후)

서버가 준비되면:
1. 이 프로토타입에서 검증된 설정을 서버에 그대로 적용
2. n8n 자동화로 매주 자동 실행
3. YouTube 자동 업로드까지 연결
