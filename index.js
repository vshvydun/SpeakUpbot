const BOT_TOKEN   = '8407508598:AAHhgwzWVC0wZte-hfaQm3-nE2NypXmgNw8';
const CRM_CHAT_ID = '8491256002';
const API_URL     = 'https://api.telegram.org/bot' + BOT_TOKEN;
 
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    if (update.callback_query) handleCallback(update.callback_query);
    else if (update.message)   handleMessage(update.message);
  } catch (err) {}
  return ContentService.createTextOutput('OK');
}
 
function getSession(chatId) {
  const raw = PropertiesService.getScriptProperties().getProperty('s_' + chatId);
  return raw ? JSON.parse(raw) : { step: null, data: {} };
}
function saveSession(chatId, s) {
  PropertiesService.getScriptProperties().setProperty('s_' + chatId, JSON.stringify(s));
}
function clearSession(chatId) {
  PropertiesService.getScriptProperties().deleteProperty('s_' + chatId);
}
 
function send(chatId, text, kb) {
  const p = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
  if (kb) p.reply_markup = JSON.stringify(kb);
  UrlFetchApp.fetch(API_URL + '/sendMessage', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(p)
  });
}
 
function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text   = (msg.text || '').trim();
  const s      = getSession(chatId);
 
  if (text === '/start') {
    clearSession(chatId);
    send(chatId,
      '👋 *Вітаємо в Speak Up!*\n\n' +
      'Ми — школа англійської мови.\n' +
      'Допоможемо досягти впевненості в англійській — від нуля до вільного спілкування! 🚀\n\n' +
      'Натисніть кнопку нижче, щоб розпочати:',
      { inline_keyboard: [[{ text: '📚 Розпочати навчання', callback_data: 'start' }]] }
    );
    return;
  }
 
  if (s.step === 'awaiting_name') {
    if (!text || text.length < 2) { send(chatId, "Введіть ваше ім'я ✍️"); return; }
    s.data.name = text;
    s.step = 'awaiting_phone';
    saveSession(chatId, s);
    send(chatId, 'Приємно познайомитись, *' + text + '*! 😊\n\nВведіть номер телефону:\n*+380 XX XXX XX XX*');
    return;
  }
 
  if (s.step === 'awaiting_phone') {
    const c = text.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[\d]{9,13}$/.test(c)) {
      send(chatId, '❗ Невірний формат.\nСпробуйте: *+380XXXXXXXXX*');
      return;
    }
    s.data.phone = text;
    s.step = 'awaiting_time';
    saveSession(chatId, s);
    send(chatId, '📅 В який час зручно отримати дзвінок?', {
      inline_keyboard: [
        [{ text: '🌅 Вранці (9:00–12:00)',   callback_data: 'time_morning'   }],
        [{ text: '☀️ Вдень (12:00–16:00)',   callback_data: 'time_afternoon' }],
        [{ text: '🌆 Ввечері (16:00–20:00)', callback_data: 'time_evening'   }]
      ]
    });
    return;
  }
 
  send(chatId, 'Натисніть /start щоб розпочати 👇',
    { inline_keyboard: [[{ text: '📚 Розпочати', callback_data: 'start' }]] });
}
 
function handleCallback(query) {
  const chatId = query.message.chat.id;
  const data   = query.data;
  const s      = getSession(chatId);
 
  UrlFetchApp.fetch(API_URL + '/answerCallbackQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: query.id })
  });
 
  if (data === 'start') {
    s.step = 'awaiting_whom'; s.data = {};
    saveSession(chatId, s);
    send(chatId, '🤔 Для кого плануєте навчання?', {
      inline_keyboard: [[
        { text: '👤 Для себе',    callback_data: 'whom_self'  },
        { text: '👧 Для дитини', callback_data: 'whom_child' }
      ]]
    });
    return;
  }
 
  if (data === 'whom_self' || data === 'whom_child') {
    s.data.forWhom = data === 'whom_self' ? 'себе' : 'дитини';
    s.step = 'awaiting_level';
    saveSession(chatId, s);
    send(chatId, 'Який рівень англійської для ' + s.data.forWhom + '? 🎯', {
      inline_keyboard: [
        [{ text: '🌱 Початківець (A0–A1)',  callback_data: 'level_beginner'     }],
        [{ text: '📘 Середній (A2–B1)',      callback_data: 'level_intermediate' }],
        [{ text: '🔥 Просунутий (B2–C1+)',  callback_data: 'level_advanced'     }]
      ]
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
    saveSession(chatId, s);
    send(chatId, levels[data].text);
    send(chatId, '📞 Запишіться на *безкоштовну зустріч* з освітнім консультантом!\n\n✍️ Введіть своє *ім\'я*:');
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
    saveSession(chatId, s);
    const d = s.data;
 
    send(chatId,
      '✅ *Заявку прийнято!*\n\n' +
      '👤 Ім\'я: *' + d.name + '*\n' +
      '📱 Телефон: *' + d.phone + '*\n' +
      '📊 Рівень: *' + d.level + '*\n' +
      '👥 Для: *' + d.forWhom + '*\n' +
      '⏰ Час: *' + d.time + '*\n\n' +
      'Наш консультант зателефонує вам у зазначений час. До зустрічі! 🤝\n\n' +
      '_Speak Up — English for Life_',
      { inline_keyboard: [[{ text: '🔄 Ще одна заявка', callback_data: 'start' }]] }
    );
 
    if (CRM_CHAT_ID) {
      send(CRM_CHAT_ID,
        '🔔 *Нова заявка!*\n\n' +
        '👤 ' + d.name + '\n' +
        '📱 ' + d.phone + '\n' +
        '👥 Для: ' + d.forWhom + '\n' +
        '📊 ' + d.level + '\n' +
        '⏰ ' + d.time
      );
    }
  }
}
 
function registerWebhook() {
  const url = ScriptApp.getService().getUrl().replace('/dev', '/exec');
  const r = UrlFetchApp.fetch(API_URL + '/setWebhook', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ url: url, allowed_updates: ['message', 'callback_query'] })
  });
  Logger.log('URL: ' + url);
  Logger.log(r.getContentText());
}
