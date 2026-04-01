const TelegramBot = require('node-telegram-bot-api');
const express     = require('express');
const https       = require('https');

const TOKEN      = process.env.BOT_TOKEN    || '8407508598:AAHhgwzWVC0wZte-hfaQm3-nE2NypXmgNw8';
const CRM_TOKEN  = process.env.KEYCRM_TOKEN || 'NmYxZGQ0MGZhNGNjZTBjMDY1ZTk2OWYwMDg0NzBhYmYwNmUzNDRiMw';
const RENDER_URL = process.env.RENDER_URL   || 'https://speakupbot.onrender.com';
const PORT       = process.env.PORT         || 10000;

const bot = new TelegramBot(TOKEN);
const app = express();
app.use(express.json());

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Speak-Up Bot is running! 🚀'));

app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
  bot.setWebHook(`${RENDER_URL}/bot${TOKEN}`);
});

// ── Сесії ──────────────────────────────────────────
const sessions = {};
function getSession(id) {
  if (!sessions[id]) sessions[id] = { step: null, data: {} };
  return sessions[id];
}

// ── Відправка ліда в KeyCRM ────────────────────────
async function sendToKeyCRM(data) {
  const body = JSON.stringify({
    buyer: {
      full_name: data.name,
      phone:     data.phone,
    },
    manager_comment:
      `Рівень: ${data.level} | Для: ${data.forWhom} | Час дзвінка: ${data.time} | Джерело: Telegram бот`,
    source_id: 1
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'openapi.keycrm.app',
      path:     '/v1/leads',
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${CRM_TOKEN}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('KeyCRM відповідь:', res.statusCode, data);
        resolve(data);
      });
    });
    req.on('error', (e) => console.error('KeyCRM помилка:', e));
    req.write(body);
    req.end();
  });
}

// ── /start ─────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  sessions[id] = { step: 'idle', data: {} };
  bot.sendMessage(id,
    '👋 *Вітаємо в Speak-Up English School!*\n\n' +
    'Ми — школа англійської мови *speak-up.com.ua*.\n' +
    'Допоможемо досягти впевненості в англійській — від нуля до вільного спілкування! 🚀\n\n' +
    'Натисніть кнопку нижче, щоб розпочати:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '📚 Розпочати навчання', callback_data: 'start' }]] }
    }
  );
});

// ── Inline кнопки ──────────────────────────────────
bot.on('callback_query', async (query) => {
  const id   = query.message.chat.id;
  const data = query.data;
  const s    = getSession(id);

  bot.answerCallbackQuery(query.id);

  if (data === 'start') {
    s.step = 'awaiting_whom'; s.data = {};
    bot.sendMessage(id, '🤔 Для кого плануєте навчання?', {
      reply_markup: { inline_keyboard: [[
        { text: '👤 Для себе',    callback_data: 'whom_self'  },
        { text: '👧 Для дитини', callback_data: 'whom_child' }
      ]]}
    });
    return;
  }

  if (data === 'whom_self' || data === 'whom_child') {
    s.data.forWhom = data === 'whom_self' ? 'себе' : 'дитини';
    s.step = 'awaiting_level';
    bot.sendMessage(id, `Який рівень англійської для ${s.data.forWhom}? 🎯`, {
      reply_markup: { inline_keyboard: [
        [{ text: '🌱 Початківець (A0–A1)',  callback_data: 'level_beginner'     }],
        [{ text: '📘 Середній (A2–B1)',      callback_data: 'level_intermediate' }],
        [{ text: '🔥 Просунутий (B2–C1+)',  callback_data: 'level_advanced'     }]
      ]}
    });
    return;
  }

  const levels = {
    level_beginner:     { label: 'Початківець (A0–A1)',  text: '🌱 *Ідеальний старт!*\n\nПочинаємо з нуля — вже за 3 місяці ви зможете вести базові розмови. 😊' },
    level_intermediate: { label: 'Середній (A2–B1)',      text: '📘 *Відмінно!*\n\nЗакриємо прогалини та виведемо на рівень впевненого спілкування. 💪' },
    level_advanced:     { label: 'Просунутий (B2–C1+)',   text: '🔥 *Вражаючий рівень!*\n\nДілова англійська, IELTS/TOEFL або розмова з носіями. 🎓' }
  };

  if (levels[data]) {
    s.data.level = levels[data].label;
    s.step = 'awaiting_name';
    bot.sendMessage(id, levels[data].text, { parse_mode: 'Markdown' });
    bot.sendMessage(id,
      '📞 Запишіться на *безкоштовну зустріч* з консультантом!\n\n✍️ Введіть своє *ім\'я*:',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const times = {
    time_morning:   'Вранці (9:00–12:00)',
    time_afternoon: 'Вдень (12:00–16:00)',
    time_evening:   'Ввечері (16:00–20:00)'
  };

  if (times[data]) {
    s.data.time = times[data];
    s.step = 'done';
    const d = s.data;

    // Підтвердження клієнту
    bot.sendMessage(id,
      '✅ *Заявку прийнято!*\n\n' +
      `👤 Ім'я: *${d.name}*\n` +
      `📱 Телефон: *${d.phone}*\n` +
      `📊 Рівень: *${d.level}*\n` +
      `👥 Для: *${d.forWhom}*\n` +
      `⏰ Час: *${d.time}*\n\n` +
      'Консультант зателефонує у зазначений час. До зустрічі! 🤝\n\n' +
      '_Speak-Up.com.ua — English for Life_',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Ще одна заявка', callback_data: 'start' }]] }
      }
    );

    // Відправка в KeyCRM
    await sendToKeyCRM(d);
  }
});

// ── Текстові повідомлення ──────────────────────────
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  const id   = msg.chat.id;
  const text = (msg.text || '').trim();
  const s    = getSession(id);

  if (s.step === 'awaiting_name') {
    if (text.length < 2) { bot.sendMessage(id, "Введіть ваше ім'я ✍️"); return; }
    s.data.name = text;
    s.step = 'awaiting_phone';
    bot.sendMessage(id,
      `Приємно познайомитись, *${text}*! 😊\n\nВведіть номер телефону:\n*+380 XX XXX XX XX*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (s.step === 'awaiting_phone') {
    const c = text.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[\d]{9,13}$/.test(c)) {
      bot.sendMessage(id, '❗ Невірний формат.\nСпробуйте: *+380XXXXXXXXX*', { parse_mode: 'Markdown' });
      return;
    }
    s.data.phone = text;
    s.step = 'awaiting_time';
    bot.sendMessage(id, '📅 В який час зручно отримати дзвінок?', {
      reply_markup: { inline_keyboard: [
        [{ text: '🌅 Вранці (9:00–12:00)',   callback_data: 'time_morning'   }],
        [{ text: '☀️ Вдень (12:00–16:00)',   callback_data: 'time_afternoon' }],
        [{ text: '🌆 Ввечері (16:00–20:00)', callback_data: 'time_evening'   }]
      ]}
    });
    return;
  }

  bot.sendMessage(id, 'Натисніть /start щоб розпочати 👇', {
    reply_markup: { inline_keyboard: [[{ text: '📚 Розпочати', callback_data: 'start' }]] }
  });
});
