const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN;
const CRM_CHAT_ID = process.env.CRM_CHAT_ID || '';

const bot = new TelegramBot(TOKEN, { polling: true });

const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { step: null, data: {} };
  return sessions[chatId];
}

// ── /start ──────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions[chatId] = { step: null, data: {} };

  bot.sendMessage(chatId,
    '👋 *Вітаємо в Speak-Up English School!*\n\n' +
    'Ми — школа англійської мови *speak-up.com.ua*.\n' +
    'Допоможемо досягти впевненості в англійській — від нуля до вільного спілкування! 🚀\n\n' +
    'Натисніть кнопку нижче, щоб розпочати:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '📚 Розпочати навчання', callback_data: 'start' }
        ]]
      }
    }
  );
});

// ── Inline кнопки ───────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const s = getSession(chatId);

  bot.answerCallbackQuery(query.id);

  if (data === 'start') {
    s.step = 'awaiting_whom';
    s.data = {};
    bot.sendMessage(chatId, '🤔 Для кого плануєте навчання?', {
      reply_markup: {
        inline_keyboard: [[
          { text: '👤 Для себе',    callback_data: 'whom_self'  },
          { text: '👧 Для дитини', callback_data: 'whom_child' }
        ]]
      }
    });
    return;
  }

  if (data === 'whom_self' || data === 'whom_child') {
    s.data.forWhom = data === 'whom_self' ? 'себе' : 'дитини';
    s.step = 'awaiting_level';
    bot.sendMessage(chatId, `Який рівень англійської для ${s.data.forWhom}? 🎯`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌱 Початківець (A0–A1)',  callback_data: 'level_beginner'     }],
          [{ text: '📘 Середній (A2–B1)',      callback_data: 'level_intermediate' }],
          [{ text: '🔥 Просунутий (B2–C1+)',  callback_data: 'level_advanced'     }]
        ]
      }
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
    await bot.sendMessage(chatId, levels[data].text, { parse_mode: 'Markdown' });
    bot.sendMessage(chatId,
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

    bot.sendMessage(chatId,
      '✅ *Заявку прийнято!*\n\n' +
      `👤 Ім'я: *${d.name}*\n` +
      `📱 Телефон: *${d.phone}*\n` +
      `📊 Рівень: *${d.level}*\n` +
      `👥 Для: *${d.forWhom}*\n` +
      `⏰ Час: *${d.time}*\n\n` +
      'Консультант зателефонує вам у зазначений час. До зустрічі! 🤝\n\n' +
      '_Speak-Up.com.ua — English for Life_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Ще одна заявка', callback_data: 'start' }
          ]]
        }
      }
    );

    if (CRM_CHAT_ID) {
      bot.sendMessage(CRM_CHAT_ID,
        '🔔 *Нова заявка!*\n\n' +
        `👤 ${d.name}\n📱 ${d.phone}\n👥 Для: ${d.forWhom}\n📊 ${d.level}\n⏰ ${d.time}`,
        { parse_mode: 'Markdown' }
      );
    }
  }
});

// ── Текстові повідомлення ───────────────────────────
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  const s = getSession(chatId);

  if (s.step === 'awaiting_name') {
    if (!text || text.length < 2) {
      bot.sendMessage(chatId, "Введіть ваше ім'я ✍️");
      return;
    }
    s.data.name = text;
    s.step = 'awaiting_phone';
    bot.sendMessage(chatId,
      `Приємно познайомитись, *${text}*! 😊\n\nВведіть номер телефону:\n*+380 XX XXX XX XX*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (s.step === 'awaiting_phone') {
    const cleaned = text.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[\d]{9,13}$/.test(cleaned)) {
      bot.sendMessage(chatId, '❗ Невірний формат.\nСпробуйте: *+380XXXXXXXXX*', { parse_mode: 'Markdown' });
      return;
    }
    s.data.phone = text;
    s.step = 'awaiting_time';
    bot.sendMessage(chatId, '📅 В який час зручно отримати дзвінок?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌅 Вранці (9:00–12:00)',   callback_data: 'time_morning'   }],
          [{ text: '☀️ Вдень (12:00–16:00)',   callback_data: 'time_afternoon' }],
          [{ text: '🌆 Ввечері (16:00–20:00)', callback_data: 'time_evening'   }]
        ]
      }
    });
    return;
  }

  if (!s.step || s.step === 'done') {
    bot.sendMessage(chatId, 'Натисніть /start щоб розпочати 👇', {
      reply_markup: {
        inline_keyboard: [[{ text: '📚 Розпочати', callback_data: 'start' }]]
      }
    });
  }
});

console.log('🤖 Speak-Up бот запущено!');
