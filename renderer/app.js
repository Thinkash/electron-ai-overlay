// ── Skill definitions ─────────────────────────────────────────────
const SKILLS = {
  noun: {
    label: '名词解释', icon: '📖',
    hint: '输入名词，返回考试级定义',
    systemPrompt: `你是研究生期末考试助手。用户输入一个名词，给出可直接写到试卷的标准解释。
格式：
【定义】一句话核心定义（20字以内）
【关键点】2～3条，每条以"·"开头
总字数不超过120字，不要废话。`
  },
  short: {
    label: '简答题', icon: '✏️',
    hint: '输入题目，返回分点答案',
    systemPrompt: `你是研究生期末考试助手。用户输入简答题题目，给出可直接写到试卷的标准答案。
格式：分点列出，编号用（1）（2）…，每点简洁有力，总字数150字以内。`
  },
  design: {
    label: '设计题', icon: '🔧',
    hint: '算法/系统/程序设计题',
    systemPrompt: `你是研究生期末考试助手。用户输入设计题，给出完整答案。
格式：
【思路】1～2句设计思路
【步骤/代码】关键步骤或核心伪代码
【说明】时间/空间复杂度等必要说明（可选）
内容完整，格式清晰，可直接写到试卷。`
  },
  calc: {
    label: '计算题', icon: '🔢',
    hint: '输入题目，返回完整计算过程',
    systemPrompt: `你是研究生期末考试助手。用户输入计算题，给出完整计算过程和最终答案。
格式：逐步列出计算过程，每步编号；最后单独一行写：【答】最终结果。
步骤清晰，结果准确，可直接写到试卷。`
  }
};

const SKILL_KEYS = Object.keys(SKILLS);

// ── DOM refs ──────────────────────────────────────────────────────
const messagesEl    = document.getElementById('messages');
const userInput     = document.getElementById('userInput');
const sendBtn       = document.getElementById('sendBtn');
const opacitySlider = document.getElementById('opacitySlider');
const skillPicker   = document.getElementById('skillPicker');
const skillBadge    = document.getElementById('skillBadge');
const skillBadgeLabel = document.getElementById('skillBadgeLabel');
const skillBadgeClear = document.getElementById('skillBadgeClear');

// ── State ─────────────────────────────────────────────────────────
/** @type {{ role: string, content: string }[]} */
let messages = [];
let isStreaming = false;
let activeSkill = null;
let pickerIndex = 0;

// ── Window controls ───────────────────────────────────────────────
document.getElementById('btnMinimize').addEventListener('click', () => {
  window.electronAPI.minimize();
});
document.getElementById('btnClose').addEventListener('click', () => {
  window.electronAPI.close();
});

// ── Opacity ───────────────────────────────────────────────────────
opacitySlider.addEventListener('input', () => {
  window.electronAPI.setOpacity(opacitySlider.value / 100);
});

// ── Auto-grow textarea ────────────────────────────────────────────
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// ── Keydown: "/" trigger + picker navigation + Enter send ─────────
userInput.addEventListener('keydown', (e) => {
  // "/" on empty input → open picker
  if (e.key === '/' && userInput.value === '') {
    e.preventDefault();
    showPicker();
    return;
  }

  if (!skillPicker.classList.contains('hidden')) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pickerIndex = (pickerIndex + 1) % SKILL_KEYS.length;
      updatePickerHighlight();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      pickerIndex = (pickerIndex - 1 + SKILL_KEYS.length) % SKILL_KEYS.length;
      updatePickerHighlight();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectSkill(SKILL_KEYS[pickerIndex]);
      return;
    }
    if (e.key === 'Escape') {
      hidePicker();
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

// ── Picker: click outside to close ───────────────────────────────
document.addEventListener('click', (e) => {
  if (!skillPicker.contains(e.target) && e.target !== userInput) {
    hidePicker();
  }
});

// ── Picker item clicks ────────────────────────────────────────────
skillPicker.querySelectorAll('li').forEach((li) => {
  li.addEventListener('click', () => selectSkill(li.dataset.skill));
});

// ── Badge clear ───────────────────────────────────────────────────
skillBadgeClear.addEventListener('click', clearSkill);

// ── Skill picker functions ────────────────────────────────────────
function showPicker() {
  pickerIndex = activeSkill ? SKILL_KEYS.indexOf(activeSkill) : 0;
  skillPicker.classList.remove('hidden');
  updatePickerHighlight();
}

function hidePicker() {
  skillPicker.classList.add('hidden');
}

function updatePickerHighlight() {
  skillPicker.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('active', i === pickerIndex);
  });
}

function selectSkill(key) {
  activeSkill = key;
  const skill = SKILLS[key];
  skillBadgeLabel.textContent = `${skill.icon} ${skill.label}`;
  skillBadge.classList.remove('hidden');
  hidePicker();
  userInput.focus();
}

function clearSkill() {
  activeSkill = null;
  skillBadge.classList.add('hidden');
  userInput.focus();
}

// ── Core send logic ───────────────────────────────────────────────
function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  appendMessage('user', text);
  messages.push({ role: 'user', content: text });

  userInput.value = '';
  userInput.style.height = 'auto';
  setStreaming(true);

  const aiEl = createAIBubble();

  window.electronAPI.removeAllListeners();

  let rawText = '';

  window.electronAPI.onChunk((chunk) => {
    rawText += chunk;
    aiEl.textContent = rawText;
    scrollToBottom();
  });

  window.electronAPI.onDone(() => {
    messages.push({ role: 'assistant', content: rawText });
    aiEl.classList.remove('streaming');
    aiEl.classList.add('rendered');
    aiEl.innerHTML = marked.parse(rawText);
    scrollToBottom();
    setStreaming(false);
  });

  window.electronAPI.onError((errMsg) => {
    aiEl.remove();
    appendError(errMsg);
    setStreaming(false);
  });

  // inject system prompt for this request only, not stored in history
  const payload = activeSkill
    ? [{ role: 'system', content: SKILLS[activeSkill].systemPrompt }, ...messages]
    : messages;
  window.electronAPI.sendMessage(payload);
}

// ── UI helpers ────────────────────────────────────────────────────
function appendMessage(role, text) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function createAIBubble() {
  const el = document.createElement('div');
  el.className = 'message ai streaming';
  el.textContent = '';
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function appendError(msg) {
  const el = document.createElement('div');
  el.className = 'message error';
  el.textContent = `错误：${msg}`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStreaming(state) {
  isStreaming = state;
  sendBtn.disabled = state;
  userInput.disabled = state;
  if (!state) userInput.focus();
}

window.addEventListener('DOMContentLoaded', () => {
  userInput.focus();
});
