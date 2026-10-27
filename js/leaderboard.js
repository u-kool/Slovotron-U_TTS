// Leaderboard Logic
const LEADERBOARD_KEY = 'word_game_leaderboard';
let lbStatRender;
let leaderboardHideTimeoutId;

function getLeaderboardData() {
    const data = localStorage.getItem(LEADERBOARD_KEY);
    if (!data) return {};
    try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        // Corrupted or legacy non-object value: drop it so we don't re-parse garbage every call.
        localStorage.removeItem(LEADERBOARD_KEY);
        return {};
    } catch (e) {
        console.error('Failed to parse leaderboard data, resetting:', e);
        localStorage.removeItem(LEADERBOARD_KEY);
        return {};
    }
}

function saveLeaderboardData(data) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
    // режим U_TTS: публикуем таблицу в хранилище темы — её показывает панель «Настройки оверлея»
    if (typeof window.__slvPublishLeaderboard === 'function') window.__slvPublishLeaderboard();
}

function updateLeaderboard(winnerName) {
    let data = getLeaderboardData();
    if (data[winnerName]) {
        data = Object.assign({ [winnerName]: data[winnerName]++ }, data);
    } else {
        data = Object.assign({ [winnerName]: 1 }, data);
    }
    saveLeaderboardData(data);
    renderLeaderboard();
    renderStatistic();
}

function renderLeaderboard() {
    const data = getLeaderboardData();
    listContainer = document.querySelector('#leaderboard .list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Convert to array and sort
    const sortedWinners = Object.entries(data)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .slice(0, 5); // Take top 5

    if (sortedWinners.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #777;">Пока нет победителей</div>';
        return;
    }

    sortedWinners.forEach((item, index) => {
        const name = item[0];
        const wins = item[1];

        const itemDiv = document.createElement('div');
        itemDiv.className = 'leaderboard-item';

        const rankDiv = document.createElement('div');
        rankDiv.className = 'rank';
        rankDiv.textContent = `#${index + 1}`;
        itemDiv.appendChild(rankDiv);

        const nameDiv = document.createElement('div');
        nameDiv.className = 'name';
        nameDiv.textContent = name; // Safe assignment
        itemDiv.appendChild(nameDiv);

        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'score';
        scoreDiv.textContent = `${wins} 🏆`;
        itemDiv.appendChild(scoreDiv);

        listContainer.appendChild(itemDiv);
    });
}

function resetLeaderboard() {
    let doReset = false;
    if (document.body.classList.contains('obs-overlay')) {
        doReset = true;
    } else {
        if (confirm('Вы уверены, что хотите сбросить таблицу лидеров?')) {
            doReset = true;
        }
    }
    if (doReset) {
        localStorage.removeItem(LEADERBOARD_KEY);
        renderLeaderboard();
        if (typeof window.__slvPublishLeaderboard === 'function') window.__slvPublishLeaderboard();
    }
}

function setLeaderboardVisible(isVisible) {
    const leaderboardSection = document.getElementById('leaderboard-statistic');
    clearTimeout(leaderboardHideTimeoutId);
    clearInterval(lbStatRender);
    leaderboardSection.style.display = isVisible ? 'flex' : 'none';

    if (isVisible) {
        renderLeaderboard();
        renderStatistic();
        lbStatRender = setInterval(function () {
            if (is_game_finished) { clearInterval(lbStatRender) }
            renderStatistic();
        }, 1000)
    }
}

function showLeaderboardTemporarily() {
    const leaderboardSection = document.getElementById('leaderboard-statistic');
    if (!leaderboardSection) return;

    // Всегда принудительно показываем таблицу лидеров на время «Перезапуск раунда»,
    // даже если она уже была видна, и сбрасываем предыдущий таймер.
    // Раунд при этом продолжается — таблица чисто информационная.
    clearTimeout(leaderboardHideTimeoutId);
    clearInterval(lbStatRender);
    leaderboardSection.style.display = 'flex';
    renderLeaderboard();
    renderStatistic();
    lbStatRender = setInterval(function () {
        if (is_game_finished) { clearInterval(lbStatRender); }
        renderStatistic();
    }, 1000);

    const showDurationMs = (typeof restart_time !== 'undefined' && restart_time > 0)
        ? restart_time * 1000 : 5000;
    leaderboardHideTimeoutId = setTimeout(() => {
        leaderboardHideTimeoutId = null;
        clearInterval(lbStatRender);
        // Не скрываем таблицу, если раунд уже завершен.
        if (!is_game_finished) leaderboardSection.style.display = 'none';
    }, showDurationMs);
}

// Event Listeners for Leaderboard
const leaderboardBtn = document.getElementById('menu-button-leaderboard');
if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', () => {
        const leaderboardSection = document.getElementById('leaderboard-statistic');
        // Toggle display
        const isVisible = leaderboardSection.style.display !== 'none';
        setLeaderboardVisible(!isVisible);
    });
}

const resetLeaderboardBtns = document.querySelectorAll('.reset-leaderboard-btn');
for (const btn of resetLeaderboardBtns) {
    btn.addEventListener('click', resetLeaderboard);
}

function pad(val) { return val > 9 ? val : "0" + val; }

function renderStatistic() {
    if (!is_game_finished) { winTime = Date.now() }
    let roundTime = Math.floor((winTime - roundStartTime) / 1000);
    if (!roundTime) { roundTime = 0 }
    const roundTimeSec = pad(roundTime % 60);
    const roundTimeMin = pad(parseInt(roundTime / 60, 10));
    const roundTimeQt = roundTimeMin + ':' + roundTimeSec;
    document.getElementById('uniq-users').innerText = uniqUsers?.size ?? 0;
    document.getElementById('uniq-words').innerText = uniqWords ?? 0;
    document.getElementById('repeated-words').innerText = repeatWords ?? 0;
    document.getElementById('round-time').innerText = roundTimeQt ?? '00:00';
}

// function to remove testuser from leaderboard
function removeTestUserFromLeaderboard() {
    const leaderboard = getLeaderboardData();
    if (leaderboard['TestUser']) {
        delete leaderboard['TestUser'];
        saveLeaderboardData(leaderboard);
    }
}

document.getElementById('remove-test-user-from-leaderboard').addEventListener('click', removeTestUserFromLeaderboard);
