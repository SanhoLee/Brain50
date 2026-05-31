// ============================================================
//  TELEGRAM BOT — 알림 발송 + 명령어 수신
//  서버에서 항상 실행: node telegram-bot.js &
//  지원 명령어: /run /status /logs /stop
// ============================================================

require('dotenv').config();
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE    = `https://api.telegram.org/bot${TOKEN}`;

// ── 메시지 전송 ──────────────────────────────────────────
async function sendMessage(text, chatId = CHAT_ID) {
  if (!TOKEN || !chatId) {
    console.log('[Telegram] 설정 없음 — 콘솔 출력:', text);
    return;
  }
  try {
    const res = await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) console.error('[Telegram] 전송 실패:', await res.text());
  } catch (e) {
    console.error('[Telegram] 오류:', e.message);
  }
}

// ── 명령어 처리 ──────────────────────────────────────────
async function handleCommand(text, chatId) {
  const cmd = text.trim().toLowerCase();

  if (cmd === '/run' || cmd === '/start_pipeline') {
    await sendMessage('⚙️ 파이프라인 시작합니다...', chatId);
    exec('cd ~/brain-pipeline && node run-pipeline.js', (err, stdout, stderr) => {
      if (err) sendMessage(`❌ 실행 오류:\n\`\`\`\n${stderr.slice(0,500)}\n\`\`\``, chatId);
      else sendMessage(`✅ 파이프라인 완료!\n\`\`\`\n${stdout.slice(-500)}\n\`\`\``, chatId);
    });
    return;
  }

  if (cmd === '/status') {
    try {
      const scriptDir = path.join(process.env.HOME, 'brain-pipeline/output/scripts');
      const files = fs.existsSync(scriptDir)
        ? fs.readdirSync(scriptDir).filter(f => f.endsWith('.json')).slice(-3)
        : [];
      await sendMessage(
        `📊 *파이프라인 상태*\n\n` +
        `서버: 정상 실행 중\n` +
        `최근 스크립트:\n${files.map(f => `• ${f}`).join('\n') || '없음'}`,
        chatId
      );
    } catch (e) {
      await sendMessage(`⚠️ 상태 확인 오류: ${e.message}`, chatId);
    }
    return;
  }

  if (cmd === '/logs') {
    try {
      const logDir = path.join(process.env.HOME, 'brain-pipeline/output/logs');
      const files = fs.existsSync(logDir)
        ? fs.readdirSync(logDir).sort().reverse().slice(0, 1)
        : [];
      if (!files.length) { await sendMessage('로그 없음', chatId); return; }
      const log = JSON.parse(fs.readFileSync(path.join(logDir, files[0]), 'utf8'));
      const summary = Object.entries(log.stages || {})
        .map(([k, v]) => `${v.status === 'success' ? '✅' : '❌'} ${k}`)
        .join('\n');
      await sendMessage(`📋 *최근 실행 로그*\n\n${summary}\n\n완료: ${log.completedAt || '진행중'}`, chatId);
    } catch (e) {
      await sendMessage(`⚠️ 로그 조회 오류: ${e.message}`, chatId);
    }
    return;
  }

  if (cmd === '/help') {
    await sendMessage(
      `🤖 *Brain Pipeline Bot 명령어*\n\n` +
      `/run — 파이프라인 즉시 실행\n` +
      `/status — 현재 상태 확인\n` +
      `/logs — 최근 실행 로그\n` +
      `/help — 이 도움말`,
      chatId
    );
    return;
  }

  await sendMessage(`❓ 모르는 명령어입니다. /help 를 입력하세요.`, chatId);
}

// ── 폴링 방식으로 메시지 수신 ─────────────────────────────
let lastUpdateId = 0;

async function pollUpdates() {
  if (!TOKEN) { console.log('[Telegram] BOT_TOKEN 없음. 봇 비활성화.'); return; }
  try {
    const res = await fetch(`${BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
    const data = await res.json();
    if (!data.ok) return;

    for (const update of (data.result || [])) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;

      // 등록된 CHAT_ID 에서만 명령 수락 (보안)
      if (String(msg.chat.id) !== String(CHAT_ID)) {
        await sendMessage('⛔ 권한 없음', msg.chat.id);
        continue;
      }

      console.log(`[Telegram] 수신: ${msg.text}`);
      await handleCommand(msg.text, msg.chat.id);
    }
  } catch (e) {
    console.error('[Telegram] 폴링 오류:', e.message);
  }
  setTimeout(pollUpdates, 1000);
}

// ── 시작 ────────────────────────────────────────────────
if (require.main === module) {
  console.log('[Telegram] 봇 시작...');
  sendMessage('🤖 Brain Pipeline Bot 시작됨\n/help 로 명령어 확인');
  pollUpdates();
}

module.exports = { sendMessage };
