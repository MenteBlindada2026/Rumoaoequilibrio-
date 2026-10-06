const state = {
  theme: 'dark',
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  selectedDate: new Date().toISOString().slice(0, 10),
  checkins: [],
  assessments: [],
  memoryCards: [],
  memoryFlipped: [],
  memoryMatched: [],
  moves: 0,
  gameXp: 0,
};

const STORAGE_KEY = 'rumoData';
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
const themeIcon = document.querySelector('.theme-icon');
const calendarGrid = document.getElementById('calendarGrid');
const monthLabel = document.getElementById('monthLabel');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const checkinResponse = document.getElementById('checkinResponse');
const assessmentForm = document.getElementById('assessmentForm');
const assessmentResult = document.getElementById('assessmentResult');
const assessmentMessage = document.getElementById('assessmentMessage');
const goalProgressBar = document.getElementById('goalProgressBar');
const dailyGoalText = document.getElementById('dailyGoalText');
const memoryGame = document.getElementById('memoryGame');
const movesCount = document.getElementById('movesCount');
const memoryFeedback = document.getElementById('memoryFeedback');
const brainQuestion = document.getElementById('brainQuestion');
const brainFeedback = document.getElementById('brainFeedback');
const numberGame = document.getElementById('numberGame');
const numberFeedback = document.getElementById('numberFeedback');
const wordGame = document.getElementById('wordGame');
const wordFeedback = document.getElementById('wordFeedback');
const gameXp = document.getElementById('gameXp');
const gameLevel = document.getElementById('gameLevel');
const gameXpBar = document.getElementById('gameXpBar');
const gameXpHint = document.getElementById('gameXpHint');

function setupAccessGate() {
  const gate = document.getElementById('accessGate');
  const form = document.getElementById('accessForm');
  const input = document.getElementById('profileName');
  const dataConsent = document.getElementById('dataConsent');
  const error = document.getElementById('accessError');
  const greeting = document.getElementById('profileGreeting');
  const assessmentGreeting = document.getElementById('assessmentGreeting');
  const signOut = document.getElementById('signOut');
  const askNameForResearch = document.body.classList.contains('research-page');
  const surveyCodeCard = document.getElementById('surveyCodeCard');
  const surveyCodeValue = document.getElementById('surveyCodeValue');
  const copySurveyCode = document.getElementById('copySurveyCode');
  if (!gate || !form || !input || !error) return;

  const enterSite = (name) => {
    document.body.dataset.accessGranted = 'true';
    gate.hidden = true;
    document.querySelectorAll('.topbar, main').forEach((element) => {
      element.inert = false;
    });
    if (greeting) greeting.textContent = `Olá, ${name}!`;
    if (assessmentGreeting) {
      assessmentGreeting.textContent = `Olá, ${name}! Vamos começar sua pesquisa?`;
      assessmentGreeting.classList.remove('hidden');
    }
    if (askNameForResearch && surveyCodeCard && surveyCodeValue) {
      const surveyCode = localStorage.getItem('rumoSurveyCode');
      if (surveyCode) {
        surveyCodeValue.textContent = surveyCode;
        surveyCodeCard.classList.remove('hidden');
      }
    }
  };

  document.querySelectorAll('.topbar, main').forEach((element) => {
    element.inert = true;
  });

  try {
    const savedName = localStorage.getItem('rumoProfileName');
    if (savedName && !askNameForResearch) enterSite(savedName);
  } catch {
    error.textContent = 'Não foi possível acessar o armazenamento local. Ative o armazenamento do navegador e tente novamente.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) {
      error.textContent = 'Digite um nome com pelo menos duas letras.';
      input.focus();
      return;
    }

    if (askNameForResearch) {
      if (!dataConsent.checked) {
        error.textContent = 'Confirme que entendeu onde as respostas serão armazenadas.';
        dataConsent.focus();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      error.textContent = 'Preparando seu código individual...';
      try {
        let clientId = localStorage.getItem('rumoSurveyClientId');
        if (!clientId) {
          clientId = crypto.randomUUID().toUpperCase();
          localStorage.setItem('rumoSurveyClientId', clientId);
        }

        let inviteCode = localStorage.getItem('rumoSurveyCode');
        if (!inviteCode) {
          const registration = await fetch('/api/survey/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId })
          });
          const registrationResult = await registration.json();
          if (!registration.ok) {
            error.textContent = registration.status === 409
              ? 'Este navegador já recebeu um código, mas o código salvo foi apagado. Recarregue uma cópia de segurança do código ou peça ajuda à pessoa responsável.'
              : registration.status === 429
                ? registrationResult.error || 'Muitas tentativas de criar códigos. Tente mais tarde.'
              : registrationResult.error || 'Não foi possível criar seu código.';
            return;
          }
          inviteCode = registrationResult.code;
          localStorage.setItem('rumoSurveyCode', inviteCode);
        }

        const response = await fetch('/api/survey/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: inviteCode })
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            localStorage.setItem('rumoProfileName', name);
            enterSite(name);
            const completeMessage = document.querySelector('#assessmentComplete p');
            completeMessage.textContent = 'Este código já foi usado para responder. A pesquisa não pode ser enviada novamente.';
            document.getElementById('assessmentForm').classList.add('hidden');
            document.getElementById('assessmentComplete').classList.remove('hidden');
            return;
          }
          error.textContent = response.status === 404
            ? 'Código não encontrado. Confira o código ou peça ajuda à pessoa responsável.'
            : result.error || 'Não foi possível verificar o código.';
          return;
        }

        localStorage.setItem('rumoProfileName', name);
        error.textContent = '';
        enterSite(name);
      } catch {
        error.textContent = 'Não foi possível conectar ao servidor. Abra o site pelo endereço do servidor e tente novamente.';
      } finally {
        submitButton.disabled = false;
      }
      return;
    }

    try {
      localStorage.setItem('rumoProfileName', name);
      error.textContent = '';
      enterSite(name);
    } catch {
      error.textContent = 'Não foi possível salvar seu nome neste dispositivo. Verifique as configurações de armazenamento do navegador.';
    }
  });

  if (signOut) {
    signOut.addEventListener('click', () => {
      try {
        localStorage.removeItem('rumoProfileName');
        document.body.dataset.accessGranted = 'false';
        gate.hidden = false;
        document.querySelectorAll('.topbar, main').forEach((element) => {
          element.inert = true;
        });
        if (greeting) greeting.textContent = '';
        input.value = '';
        input.focus();
      } catch {
        error.textContent = 'Não foi possível encerrar a sessão local. Verifique as configurações do navegador.';
      }
    });
  }

  if (copySurveyCode && surveyCodeValue) {
    copySurveyCode.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(surveyCodeValue.textContent);
        copySurveyCode.textContent = 'Código copiado!';
        window.setTimeout(() => {
          copySurveyCode.textContent = 'Copiar código';
        }, 1800);
      } catch {
        error.textContent = 'Não foi possível copiar automaticamente. Selecione e copie o código exibido.';
      }
    });
  }
}

function saveData() {
  const data = {
    theme: state.theme,
    checkins: state.checkins,
    assessments: state.assessments,
    gameXp: state.gameXp
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  state.theme = theme;
  const isDark = theme === 'dark';
  if (themeLabel) themeLabel.textContent = isDark ? 'Modo escuro' : 'Modo claro';
  if (themeIcon) themeIcon.textContent = isDark ? '☾' : '☀';
  if (themeToggle) themeToggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
}

function loadData() {
  try {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const oldSettings = JSON.parse(localStorage.getItem('rumoSettings') || '{}');
    const oldCheckins = JSON.parse(localStorage.getItem('rumoCheckins') || '[]');
    const oldAssessments = JSON.parse(localStorage.getItem('rumoAssessments') || '[]');

    state.theme = savedData.theme || oldSettings.theme || 'dark';
    state.checkins = Array.isArray(savedData.checkins) ? savedData.checkins : oldCheckins;
    state.assessments = Array.isArray(savedData.assessments) ? savedData.assessments : oldAssessments;
    state.gameXp = Number.isFinite(Number(savedData.gameXp)) ? Number(savedData.gameXp) : 0;
  } catch {
    state.theme = 'dark';
    state.checkins = [];
    state.assessments = [];
    state.gameXp = 0;
  }

  setTheme(state.theme);
  saveData();
  updateGameProgress();
}

function updateGameProgress() {
  if (!gameXp || !gameLevel || !gameXpBar || !gameXpHint) return;

  const level = Math.floor(state.gameXp / 100) + 1;
  const progress = state.gameXp % 100;
  gameXp.textContent = String(state.gameXp);
  gameLevel.textContent = String(level);
  gameXpBar.style.width = `${progress}%`;
  gameXpBar.parentElement.setAttribute('aria-valuenow', String(progress));
  gameXpHint.textContent = `Mais ${100 - progress} XP para o próximo nível. Seu progresso fica salvo neste dispositivo.`;
}

function awardGameXp(points) {
  state.gameXp += points;
  saveData();
  updateGameProgress();
}

function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderCalendar() {
  calendarGrid.innerHTML = '';
  const today = new Date();
  const firstDay = new Date(state.year, state.month, 1);
  const startWeekDay = firstDay.getDay();
  const totalDays = new Date(state.year, state.month + 1, 0).getDate();
  const prevMonthDays = new Date(state.year, state.month, 0).getDate();

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  weekDays.forEach((day) => {
    const name = document.createElement('div');
    name.className = 'day-name';
    name.textContent = day;
    calendarGrid.appendChild(name);
  });

  for (let i = 1; i <= startWeekDay; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day muted';
    cell.textContent = prevMonthDays - startWeekDay + i;
    calendarGrid.appendChild(cell);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const cell = document.createElement('button');
    const currentDate = new Date(state.year, state.month, day);
    const dateString = currentDate.toISOString().slice(0, 10);
    const isToday = currentDate.toDateString() === today.toDateString();
    const isSelected = state.selectedDate === dateString;
    const exists = state.checkins.some((entry) => entry.date === dateString);

    cell.type = 'button';
    cell.className = 'calendar-day';
    if (isToday) cell.classList.add('today');
    if (isSelected) cell.classList.add('selected');
    if (exists) cell.classList.add('has-checkin');
    cell.textContent = day;
    cell.addEventListener('click', () => {
      state.selectedDate = dateString;
      renderCalendar();
      renderCheckinCard();
    });
    calendarGrid.appendChild(cell);
  }

  monthLabel.textContent = new Date(state.year, state.month).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

function renderCheckinCard() {
  const selectedDate = state.selectedDate;
  const formatted = formatDate(selectedDate);
  selectedDateLabel.textContent = `Data selecionada: ${formatted}`;

  const checkin = state.checkins.find((entry) => entry.date === selectedDate);

  if (!checkin) {
    checkinResponse.className = 'checkin-response empty';
    checkinResponse.textContent = 'Sua resposta aparecerá aqui com apoio e técnicas.';
    return;
  }

  if (Number(checkin.smoked_today) === 1) {
    checkinResponse.className = 'checkin-response';
    checkinResponse.innerHTML = `
      <strong>Frase motivacional:</strong><br>
      ${checkin.message || 'Você não precisa desistir. Cada dia é uma nova chance de recomeçar.'}
    `;
    return;
  }

  checkinResponse.className = 'checkin-response';
  checkinResponse.innerHTML = `
    <strong>Técnicas para aliviar sintomas da nicotina:</strong><br>
    ${checkin.tips || 'Hidratação, caminhada curta, chá de hortelã, respiração profunda e distração com música ou água.'}
  `;
}

function updateMetaProgress() {
  if (!goalProgressBar || !dailyGoalText) return;

  const checkins = state.checkins.filter((entry) => Number(entry.smoked_today) === 0);
  const progress = Math.min(Math.round((checkins.length / 7) * 100), 100);
  goalProgressBar.style.width = `${progress}%`;
  dailyGoalText.textContent = `${progress}% da meta`;
  goalProgressBar.parentElement.setAttribute('aria-valuenow', String(progress));
}

function loadCheckins() {
  if (calendarGrid) renderCalendar();
  if (selectedDateLabel && checkinResponse) renderCheckinCard();
  updateMetaProgress();
}

function saveCheckin(smokedToday) {
  const message = smokedToday
    ? 'Você já passou por dias difíceis antes e isso não define o seu valor. Cada passo conta.'
    : 'Parabéns por escolher cuidar de si. Respire fundo, beba água e mantenha o foco.';
  const tips = smokedToday
    ? 'Técnicas úteis: beba água, respire por 4 segundos e expire por 6, dê um passo para fora da rotina, e ligue para alguém de confiança.'
    : 'Para aliviar sintomas da nicotina: caminhe 10 minutos, tome água, chupe gelo, use hortelã, ou faça respiração profunda por 5 minutos.';

  const existing = state.checkins.find((entry) => entry.date === state.selectedDate);
  const checkin = {
    date: state.selectedDate,
    smoked_today: smokedToday ? 1 : 0,
    message,
    tips
  };

  if (existing) {
    Object.assign(existing, checkin);
  } else {
    state.checkins.push(checkin);
  }

  saveData();
  renderCalendar();
  renderCheckinCard();
  updateMetaProgress();
}

function setupAssessment() {
  if (!assessmentForm) return;

  assessmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const answers = {};
    let score = 0;
    const questions = Array.from(document.querySelectorAll('.question input[type="radio"]'));

    questions.forEach((radio) => {
      const key = radio.name;
      if (radio.checked) {
        answers[key] = radio.value;
        score += Number(radio.value);
      }
    });

    if (Object.keys(answers).length !== 5) {
      assessmentMessage.textContent = 'Responda todas as perguntas antes de continuar.';
      assessmentResult.classList.remove('hidden');
      return;
    }

    let level = 'Baixa';
    if (score >= 4) {
      level = 'Muita ajuda';
    } else if (score >= 2) {
      level = 'Pouca ajuda';
    }

    const message =
      level === 'Muita ajuda'
        ? 'Seu retorno indica que pode ser importante pedir apoio de um adulto, professor ou profissional de saúde. Você não precisa lidar com isso sozinho.'
        : level === 'Pouca ajuda'
          ? 'Você está com sinais moderados. Acompanhe sua rotina e procure conversas abertas com alguém de confiança.'
          : 'Seu quadro parece mais estável neste momento; continue com hábitos saudáveis e atenção aos sinais do dia a dia.';

    const inviteCode = localStorage.getItem('rumoSurveyCode');
    if (!inviteCode) {
      assessmentMessage.textContent = 'Sua sessão da pesquisa expirou. Recarregue a página e confira seu código individual.';
      assessmentResult.classList.remove('hidden');
      return;
    }

    const submitButton = assessmentForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    assessmentMessage.textContent = 'Salvando sua pesquisa...';
    assessmentResult.classList.remove('hidden');

    try {
      const response = await fetch('/api/survey/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: inviteCode,
          answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, Number(value)]))
        })
      });
      const result = await response.json();
      if (!response.ok) {
        assessmentMessage.textContent = response.status === 409
          ? 'Este código já foi usado. Cada pessoa pode responder à pesquisa uma única vez.'
          : result.error || 'Não foi possível salvar sua pesquisa.';
        submitButton.disabled = response.status === 409;
        return;
      }

      assessmentMessage.textContent = `${message} Nível: ${level}.`;
      assessmentResult.classList.add('hidden');
      assessmentForm.classList.add('hidden');
      document.getElementById('assessmentComplete').classList.remove('hidden');
    } catch {
      assessmentMessage.textContent = 'Não foi possível conectar ao servidor. Sua pesquisa não foi registrada; verifique a conexão e tente novamente.';
      submitButton.disabled = false;
    }
  });
}

function initMemoryGame() {
  if (!memoryGame || !movesCount) return;

  const icons = ['🌱', '🧠', '💪', '🌊', '🚭', '💙'];
  state.memoryCards = [...icons, ...icons].sort(() => Math.random() - 0.5);
  state.memoryFlipped = [];
  state.memoryMatched = [];
  state.moves = 0;
  movesCount.textContent = '0';
  if (memoryFeedback) memoryFeedback.textContent = 'Vire duas cartas para começar!';
  memoryGame.innerHTML = '';

  state.memoryCards.forEach((icon, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'memory-card';
    card.dataset.icon = icon;
    card.dataset.index = index;
    card.textContent = '?';
    card.addEventListener('click', () => handleMemoryClick(card, icon));
    memoryGame.appendChild(card);
  });
}

function handleMemoryClick(card, icon) {
  if (
    state.memoryFlipped.includes(card) ||
    state.memoryMatched.includes(card) ||
    state.memoryFlipped.length >= 2
  ) {
    return;
  }

  card.textContent = icon;
  card.classList.add('flipped');
  state.memoryFlipped.push(card);

  if (state.memoryFlipped.length === 2) {
    state.moves += 1;
    movesCount.textContent = String(state.moves);

    const [first, second] = state.memoryFlipped;
    if (first.dataset.icon === second.dataset.icon) {
      state.memoryMatched.push(first, second);
      setTimeout(() => {
        first.classList.add('matched');
        second.classList.add('matched');
        state.memoryFlipped = [];
        awardGameXp(15);
        if (memoryFeedback) memoryFeedback.textContent = 'Par encontrado! +15 XP ✨';
        if (state.memoryMatched.length === state.memoryCards.length) {
          awardGameXp(25);
          if (memoryFeedback) memoryFeedback.textContent = `Você encontrou todos os pares em ${state.moves} jogadas! Bônus +25 XP 🏆`;
        }
      }, 400);
    } else {
      setTimeout(() => {
        first.textContent = '?';
        second.textContent = '?';
        first.classList.remove('flipped');
        second.classList.remove('flipped');
        state.memoryFlipped = [];
        if (memoryFeedback) memoryFeedback.textContent = 'Sem par desta vez. Tente outra combinação!';
      }, 600);
    }
  }
}

function setupBrainChallenge() {
  if (!brainFeedback) return;

  let completed = false;
  document.querySelectorAll('.brain-option').forEach((button) => {
    button.addEventListener('click', () => {
      const answer = button.dataset.answer === '1';
      if (completed) return;

      if (answer) {
        completed = true;
        awardGameXp(10);
        brainFeedback.textContent = 'Mandou bem! Foco é uma escolha diária. +10 XP 🎉';
        document.querySelectorAll('.brain-option').forEach((option) => {
          option.disabled = true;
        });
      } else {
        brainFeedback.textContent = 'Quase! Respire e tente outra resposta.';
        button.classList.add('wrong-answer');
        setTimeout(() => button.classList.remove('wrong-answer'), 450);
      }
    });
  });
}

function setupNumberGame() {
  if (!numberGame || !numberFeedback) return;

  const sequence = [3, 7, 2, 9];
  const options = [3, 7, 2, 9, 5];
  let current = 0;

  numberGame.innerHTML = `
    <p>Ordem: ${sequence.join(' · ')}</p>
    <div class="number-options"></div>
  `;
  const optionContainer = numberGame.querySelector('.number-options');
  options.forEach((option) => {
    const button = document.createElement('button');
    button.className = 'number-option';
    button.textContent = option;
    button.addEventListener('click', () => {
      if (option === sequence[current]) {
        button.classList.add('correct');
        button.disabled = true;
        current += 1;
        awardGameXp(5);
        numberFeedback.textContent = `${current} de ${sequence.length} correto${current === sequence.length ? '!' : ''}`;
        if (current === sequence.length) {
          numberFeedback.textContent = 'Sequência completa! Raciocínio afiado. +20 XP no total 🏆';
          optionContainer.querySelectorAll('button').forEach((item) => {
            item.disabled = true;
          });
        }
      } else {
        numberFeedback.textContent = 'Não é esse número. Tente novamente.';
        current = 0;
        optionContainer.querySelectorAll('button').forEach((item) => {
          item.disabled = false;
          item.classList.remove('correct');
        });
      }
    });
    optionContainer.appendChild(button);
  });
}

function setupWordGame() {
  if (!wordGame || !wordFeedback) return;

  const word = { scrambled: 'HONOS', answer: 'SONHO' };
  const options = ['SONHO', 'HOSNO', 'HONOS', 'NOHOS'];

  wordGame.innerHTML = `
    <p>Palavra: ${word.scrambled}</p>
    <div class="word-options"></div>
  `;
  const optionContainer = wordGame.querySelector('.word-options');
  options.forEach((option) => {
    const button = document.createElement('button');
    button.className = 'word-option';
    button.textContent = option;
    button.addEventListener('click', () => {
      const correct = option === word.answer;
      if (correct) {
        awardGameXp(20);
        button.classList.add('correct');
        wordFeedback.textContent = 'Acertou! A palavra é SONHO. +20 XP 🎉';
        optionContainer.querySelectorAll('button').forEach((item) => {
          item.disabled = true;
        });
      } else {
        wordFeedback.textContent = 'Não foi dessa vez. Observe as letras e tente outra opção!';
        button.classList.add('wrong-answer');
        setTimeout(() => button.classList.remove('wrong-answer'), 450);
      }
    });
    optionContainer.appendChild(button);
  });
}

function setupClickGame() {
  const target = document.getElementById('clickTarget');
  const start = document.getElementById('clickStart');
  const scoreLabel = document.getElementById('clickScore');
  const feedback = document.getElementById('clickFeedback');
  if (!target || !start || !scoreLabel || !feedback) return;

  let score = 0;
  let timeLeft = 15;
  let timer;
  const placeTarget = () => {
    target.style.left = `${Math.round(Math.random() * 75)}%`;
    target.style.top = `${Math.round(Math.random() * 70)}%`;
  };

  start.addEventListener('click', () => {
    clearInterval(timer);
    score = 0;
    timeLeft = 15;
    scoreLabel.textContent = '0';
    feedback.textContent = 'Vai! Encontre as estrelas!';
    target.disabled = false;
    start.disabled = true;
    placeTarget();
    timer = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft <= 0) {
        clearInterval(timer);
        target.disabled = true;
        start.disabled = false;
        feedback.textContent = `Tempo! Você encontrou ${score} ${score === 1 ? 'estrela' : 'estrelas'}.`;
        return;
      }
      feedback.textContent = `${timeLeft} segundos restantes — continue!`;
    }, 1000);
  });

  target.addEventListener('click', () => {
    if (target.disabled) return;
    score += 1;
    scoreLabel.textContent = String(score);
    feedback.textContent = `Boa! ${score} ${score === 1 ? 'estrela' : 'estrelas'} — restam ${timeLeft} segundos!`;
    awardGameXp(3);
    placeTarget();
    target.classList.remove('target-pop');
    void target.offsetWidth;
    target.classList.add('target-pop');
  });
}

function setupMathGame() {
  const question = document.getElementById('mathQuestion');
  const options = document.getElementById('mathOptions');
  const roundLabel = document.getElementById('mathRound');
  const start = document.getElementById('mathStart');
  const feedback = document.getElementById('mathFeedback');
  if (!question || !options || !roundLabel || !start || !feedback) return;

  let round = 0;
  let answer = 0;
  let running = false;

  const nextQuestion = () => {
    if (round >= 5) {
      running = false;
      question.textContent = 'Desafio concluído! Mandou muito bem!';
      options.replaceChildren();
      start.disabled = false;
      feedback.textContent = 'Quer tentar mais uma rodada?';
      return;
    }

    const first = Math.floor(Math.random() * 12) + 1;
    const second = Math.floor(Math.random() * 12) + 1;
    const operation = Math.random() < 0.5 ? '+' : '−';
    answer = operation === '+' ? first + second : Math.abs(first - second);
    const prompt = operation === '+' ? `${first} + ${second}` : `${Math.max(first, second)} − ${Math.min(first, second)}`;
    running = true;
    question.textContent = `${prompt} = ?`;
    const choices = new Set([answer]);
    while (choices.size < 4) {
      choices.add(Math.max(0, answer + Math.floor(Math.random() * 9) - 4));
    }
    options.replaceChildren();
    [...choices].sort(() => Math.random() - 0.5).forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'math-option';
      button.textContent = String(value);
      button.addEventListener('click', () => {
        if (!running) return;
        if (value === answer) {
          awardGameXp(5);
          feedback.textContent = 'Resposta certa! +5 XP ✨';
          round += 1;
          roundLabel.textContent = `${round}/5`;
          running = false;
          options.querySelectorAll('button').forEach((choice) => {
            choice.disabled = true;
          });
          setTimeout(() => {
            if (start.disabled) nextQuestion();
          }, 550);
        } else {
          feedback.textContent = 'Quase! Tente outra resposta.';
          button.classList.add('wrong-answer');
          setTimeout(() => button.classList.remove('wrong-answer'), 450);
        }
      });
      options.appendChild(button);
    });
  };

  start.addEventListener('click', () => {
    round = 0;
    roundLabel.textContent = '0/5';
    running = true;
    start.disabled = true;
    feedback.textContent = 'Vamos lá!';
    nextQuestion();
  });
}

function setupCalendarActions() {
  const prevMonth = document.getElementById('prevMonth');
  const nextMonth = document.getElementById('nextMonth');

  if (prevMonth) prevMonth.addEventListener('click', () => {
    state.month -= 1;
    if (state.month < 0) {
      state.month = 11;
      state.year -= 1;
    }
    renderCalendar();
  });

  if (nextMonth) nextMonth.addEventListener('click', () => {
    state.month += 1;
    if (state.month > 11) {
      state.month = 0;
      state.year += 1;
    }
    renderCalendar();
  });

  document.querySelectorAll('[data-smoked]').forEach((button) => {
    button.addEventListener('click', () => {
      const smokedToday = button.dataset.smoked === '1';
      saveCheckin(smokedToday);
    });
  });
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveData();
  });
}

window.addEventListener('rumo:xp', (event) => {
  const points = Number(event.detail);
  if (Number.isFinite(points) && points > 0) awardGameXp(points);
});

setupAccessGate();
loadData();
setupAssessment();
setupCalendarActions();
setupBrainChallenge();
setupNumberGame();
setupWordGame();
setupClickGame();
setupMathGame();
initMemoryGame();
const restartMemory = document.getElementById('restartMemory');
if (restartMemory) restartMemory.addEventListener('click', initMemoryGame);
loadCheckins();
