const last_words_container = document.querySelector('.guessing .last-words');
const best_match_container = document.querySelector('.guessing .best-match');

const emit = (name, data) => document.dispatchEvent(new CustomEvent(name, { detail: data }));
const isObsOverlayMode = () => document.body.classList.contains('obs-overlay');

function setOverlayIdleState(isIdle) {
    if (!isObsOverlayMode() || overlay_idle_timeout <= 0) return;
    if (isIdle && is_game_finished) return; // не делаем оверлей полупрозрачным пока показывается экран победы
    is_overlay_idle = isIdle;
    document.body.classList.toggle('overlay-words-idle', isIdle);
}

function markOverlayActivity() {
    if (!isObsOverlayMode() || overlay_idle_timeout <= 0) return;
    setOverlayIdleState(false);
    if (overlay_idle_timeout_id) {
        clearTimeout(overlay_idle_timeout_id);
    }
    overlay_idle_timeout_id = setTimeout(() => {
        setOverlayIdleState(true);
    }, overlay_idle_timeout * 1000);
}

function addAnythingToLastWords(html) {
    if (window.slvWordLayout === 'classic') {
        // «Классический»: копим ленту последних слов (как в оригинальной игре)
        last_words_container.insertAdjacentHTML('afterbegin', html);
        while (last_words_container.children.length > MAX_LAST_WORDS) {
            last_words_container.removeChild(last_words_container.lastElementChild);
        }
    } else {
        // «Контекстно»: сверху всегда только одно последнее слово
        last_words_container.innerHTML = html;
    }
}
function addTextToLastWords(text = '') {
    const html = `
        <div class="msg">
            <div class="msg-content">
                <div class="word-and-distance">
                    <div class="word">${text}</div>
                </div>
            </div>
        </div>`
    addAnythingToLastWords(html);
}

function addWordStatusToLastWords(word = '', status = '') {
    const banword_class = is_banword(word) ? ' banword' : '';
    const html = `
        <div class="msg${banword_class}">
            <div class="msg-content">
                <div class="word-and-distance">
                    <div class="word">${render_word_html(word)} ${status}</div>
                </div>
            </div>
        </div>`;
    addAnythingToLastWords(html);
}

function getDistanceColor(distance) {
    const colors = [
        'linear-gradient(90deg,rgba(128, 0, 128, 0.5) 0%, rgba(128, 0, 128, 1) 100%);',
        'linear-gradient(90deg,rgba(0, 128, 0, 0.5) 0%, rgba(0, 128, 0, 1) 100%);',
        'linear-gradient(90deg,rgba(255, 255, 0, 0.5) 0%, rgba(255, 255, 0, 0.7) 100%);',
        'linear-gradient(90deg,rgba(255, 160, 0, 0.5) 0%, rgba(255, 160, 0, 1) 100%);',
        'linear-gradient(90deg,rgba(255, 0, 0, 0.5) 0%, rgba(255, 0, 0, 1) 100%);'
    ];

    if (distance === 1) {
        return colors[0];
    } else if (distance <= 150) {
        return colors[1];
    } else if (distance <= 550) {
        return colors[2];
    } else if (distance <= 1400) {
        return colors[3];
    } else {
        return colors[4];
    }
}




async function process_message(user, nickname_color, word, force_win = false) {

    if (is_game_finished) return;

    // перевод слова в нижний регистр
    word = word.toLowerCase();
    // сделать первую букву большой
    // word = word.charAt(0).toUpperCase() + word.slice(1);

    // Проверяем, есть ли слово в списке
    if (checked_words.has(word)) {
        if (checked_words.get(word).distance) {
            if (!uniqUsers.has(user.username)) {
                uniqUsers.add(user.username);
                emit('uniqueGuessersAmountChanged');
            }
            repeatWords++;
        }
        // добавить слово в колонку .guessing .last-words в верх списка
        addWordStatusToLastWords(word, 'уже было использовано');
        // console.log(`Слово "${word}" уже было проверено.`);
        return;
    }

    // Если слова нет — выполняем логику
    console.log(`Новое слово: ${word}. Обрабатываю...`);
    markOverlayActivity();

    let word_check;

    try {
        if (force_win) {
            word_check = { distance: 1 };
        } else {
            word_check = await score_word(word, secret_word_id);
        }
    } catch (err) {
        // Any guess error can mean the game itself is gone (an expired token, for
        // one), so ask the backend — the report stays the same either way.
        if (await backend_game_is_live(secret_word_id) === false) {
            console.warn('Игра больше не существует на сервере.');
            addWordStatusToLastWords(word, 'Ошибка: Игра больше не существует.');
            return;
        }
        console.warn('Ошибка проверки слова:', err);
        addWordStatusToLastWords(word, 'ошибка API');
        return;
    }

    checked_words.set(word, { distance: word_check.distance });

    if (!word_check.distance) {
        addWordStatusToLastWords(word, 'не найдено в словаре');
        // console.log(`Слово "${word}" не имеет дистанци.`);
        return;
    }

    if (word_check.distance < best_found_distance) {
        console.log('Новая лучшая дистанция:', word_check.distance);
        best_found_distance = word_check.distance;
    }

    if (!uniqUsers.has(user.username)) {
        uniqUsers.add(user.username);
        // if (typeof update_tip_progress === 'function') update_tip_progress();
        emit('uniqueGuessersAmountChanged');
    }
    uniqWords++;

    // готовый html шаблон слова
    const new_message = message_template(
        word,
        word_check.distance,
        user['display-name'],
        nickname_color
    );

    // левый блок - только последнее введённое слово
    addAnythingToLastWords(new_message);

    // правый блок - сортировка по дистанции как в оригинале
    addMatchWord(new_message, word_check.distance);

    // обработка победы (слово угадано)
    if (word_check.distance == 1) {
        handle_win(user, word);
    }

}

function addMatchWord(new_message, distance) {
    // Создаем элемент из HTML строки
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = new_message.trim();
    const newMsgElement = tempDiv.firstElementChild;

    // Определяем позицию вставки на основе дистанции
    const container = best_match_container;
    const children = Array.from(container.children);
    let insertIndex = children.length;
    const newDistance = parseFloat(distance);

    for (let i = 0; i < children.length; i++) {
        const childDistance = parseFloat(children[i].dataset.distance);
        if (childDistance > newDistance) {
            insertIndex = i;
            break;
        }
    }

    if (insertIndex === 0 && newDistance < 150) {
        if (sound_enable) {
            const audio = new Audio('audio/slovotron-ding-1.mp3');
            audio.volume = 0.1;
            audio.play().catch(e => console.error('Ошибка воспроизведения звука:', e));
        }
    }

    // Вставляем элемент в правильную позицию
    if (insertIndex === children.length) {
        container.appendChild(newMsgElement);
    } else {
        container.insertBefore(newMsgElement, children[insertIndex]);
    }

    // «Контекстно» — держим не более топ-10 по дистанции, «Классический» — как в оригинале
    while (window.slvWordLayout !== 'classic' && container.children.length > 10) {
        container.removeChild(container.lastElementChild);
    }
}

function message_template(word, distance, name, nickname_color) {

    const width = Math.max(0, 100 - (distance / 2800) * 100);
    const distance_color = getDistanceColor(distance);
    const banword_class = is_banword(word) ? ' banword' : '';

    return `
        <div class="msg${banword_class}" data-distance="${distance}">
            <div class="msg-content">
                <div class="bg" style="width: ${width}%; background: ${distance_color}"></div>
                <div class="word-and-distance">
                    <div class="word">${render_word_html(word)}</div>
                    <div class="distance">${distance}</div>
                </div>
                ${show_nicknames ? `<div class="name" style="color: ${nickname_color}; white-space: nowrap;">
                    <span>${name}</span>
                </div>` : ''}
            </div>
        </div>
    `;
}

function play_win_sound(winner_user, winning_word = '') {
    if (!sound_enable) return;

    const play = (url) => {
        const audio = new Audio(url);
        audio.volume = WIN_SOUND_VOLUME;
        audio.play().catch(e => console.error('Ошибка воспроизведения звука победы:', e));
    };

    const nick = winner_user && winner_user['display-name'] ? String(winner_user['display-name']).trim() : '';
    const hasVoice = (Array.isArray(win_blocks) && win_blocks.length) || !!win_voice;
    // Победа «подсказкой» озвучивается так же, как обычная: при настроенных блоках
    // — генерация ({UserName} = «💡 Подсказка»), без блоков — встроенный mp3.
    if (!winner_user || !nick) {
        play(DEFAULT_WIN_SOUND_URL);
        if (win_sound_url) play(win_sound_url);
        return;
    }

    // Встроенный mp3 и свой URL-звук играют только когда TTS-озвучка не настроена:
    // при настроенных блоках победный звук — генерация из модалки.
    if (!hasVoice) {
        play(DEFAULT_WIN_SOUND_URL);
        if (win_sound_url) {
            play(win_sound_url);
        }
    }

    const vars = {
        '{UserName}': nick, '{User}': nick, '{Nickname}': nick,
        '{Word}': winning_word ? String(winning_word) : '',
    };
    const speak = (text, block) => {
        const body = { text: text, voice: block.voice, forceVoice: true };
        if (block.rate) body.rate = block.rate;
        if (block.volume) body.volume = block.volume;
        if (block.pitch) body.pitch = block.pitch;
        if (block.speed) body.speed = block.speed;
        if (block.reverb) body.reverb = block.reverb;
        if (block.qwen3_language) body.qwen3_language = block.qwen3_language;
        if (block.language) body.language = block.language;
        fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).catch(e => console.error('Ошибка озвучки победы:', e));
        // Текст объявления — в чат главного окна и в журнал событий ((EVENT)
        fetch('/api/notice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'event', user: nick, text: text, platform: 'slovotron' })
        }).catch(e => console.error('Ошибка отправки объявления в чат:', e));
    };

    if (Array.isArray(win_blocks) && win_blocks.length) {
        for (const block of win_blocks) {
            const messages = Array.isArray(block.messages) ? block.messages : [];
            for (const m of messages) {
                const tpl = m && typeof m.message === 'string' ? m.message : '';
                if (!tpl.trim()) continue;
                let text = tpl;
                for (const k in vars) text = text.split(k).join(vars[k]);
                if (text.trim()) speak(text, block);
            }
        }
    } else if (win_voice) {
        let text = 'Победитель — ' + nick + '!';
        if (winning_word) text += ' Загаданное слово — ' + winning_word + '.';
        speak(text, { voice: win_voice });
    }
}

function handle_win(winner_user, winning_word = '') {

    is_game_finished = true;
    setManualGuessReady(false);
    winTime = Date.now();

    tip_menu_button.style.display = 'none';

    if (typeof updateLeaderboard === 'function') {
        updateLeaderboard(winner_user['display-name']);
        const leaderboardSection = document.getElementById('leaderboard-statistic');
        if (leaderboardSection) leaderboardSection.style.display = 'flex';
    }

    const winnerAvatar = document.getElementById('winner-avatar');
    // Transparent 1x1 GIF placeholder avoids a broken-image icon when no avatar loads.
    winnerAvatar.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    winnerAvatar.classList.toggle('blurred', !win_avatar_enable);
    // Only hit the Twitch API when the avatar is actually shown. getTwitchUserData
    // returns null on lookup failure, so guard before reading user.logo.
    if (win_avatar_enable) {
        getTwitchUserData(winner_user.username).then((user) => {
            if (user?.logo) winnerAvatar.src = user.logo;
        }).catch((e) => console.error('avatar load failed:', e));
    }

    const winnerBlock = document.getElementById('winner');
    winnerBlock.querySelector('.winner-name').innerText = winner_user['display-name'];
    winnerBlock.style.display = 'block';

    const roundDurationSec = roundStartTime ? Math.max(0, Math.floor((Date.now() - roundStartTime) / 1000)) : 0;

    sendWebhookEvent('game-win', {
        winner: {
            login: winner_user.username || '',
            display_name: winner_user['display-name'] || winner_user.username || ''
        },
        winning_word: winning_word,
        attempts_used: checked_words.size,
        unique_words: uniqWords,
        repeated_words: repeatWords,
        round_duration_sec: roundDurationSec
    });

    if (typeof analytics_reach_goal === 'function') {
        analytics_reach_goal('round_win', {
            channel_name: channel_name,
            game_backend: game_backend,
            unique_players_count: uniqUsers.size,
            total_guesses_count: checked_words.size,
            round_duration_sec: roundDurationSec,
            hints_used: typeof hints_used === 'number' ? hints_used : 0
        });
    }

    const resetTimeout = (typeof restart_time !== 'undefined' ? restart_time : 20) * 1000;
    let confettiTimeout = Date.now() + (restart_time - 5) * 1000;
    if (restart_time <= 10) { confettiTimeout = Date.now() + 5 * 1000 };
    // A non-finite restart_time makes the stop check (timeLeft <= 0) never true,
    // leaving confetti/fireworks running forever — clamp to a short fallback.
    if (!Number.isFinite(confettiTimeout)) { confettiTimeout = Date.now() + 5 * 1000; }
    // Never run confetti longer than the cap, even for huge restart_time values.
    confettiTimeout = Math.min(confettiTimeout, Date.now() + MAX_CONFETTI_MS);
    confetti_stars(confetti_win(confettiTimeout));
    if (window.innerWidth > 1200) {
        confetti_fireworks(confettiTimeout);
    }

    play_win_sound(winner_user, winning_word);

    if (restart_time > 0 && !document.hidden) {
        const menuTimer = document.getElementById('menu-timer');
        menuTimer.innerHTML = pad(restart_time);
        menuTimer.style.display = 'block'

        resetRoundTimeout(resetTimeout);

        const restartTime = Date.now() + (restart_time * 1000);

        menuTimerId = setInterval(async () => {
            let sec = Math.floor((restartTime - Date.now()) / 1000);
            if (Date.now() > restartTime) {
                clearInterval(menuTimerId);
                menuTimer.style.display = 'none';
            } else {
                menuTimer.innerHTML = pad(sec);
            }
        }, 333)
    } else {
        document.getElementById('menu-button-restart').style.display = 'block';
    }

}

async function resetRoundTimeout(time) {
    resetRoundTimeoutId = setTimeout(async () => {
        try {
            secret_word_id = await generate_secret_word();
            sendWebhookEvent('game-new', {
                challenge_id: secret_word_id,
                secret_word: current_secret_word_data?.secret_word || null
            });
            if (typeof __slvPublishGameKey === 'function') __slvPublishGameKey(secret_word_id, current_secret_word_data);
        } catch (e) {
            console.error(e);
        }

        reset_round();
        document.getElementById('winner').style.display = 'none';

        const leaderboardSection = document.getElementById('leaderboard-statistic');
        if (leaderboardSection) leaderboardSection.style.display = 'none';

        is_game_finished = false;
        setManualGuessReady(true);
    }, time);
}

function reset_round() {
    last_words_container.innerHTML = '';
    best_match_container.innerHTML = '';
    var uttsLastWord = document.getElementById('utts-last-word');
    if (uttsLastWord) uttsLastWord.innerHTML = '';
    stop_confetti();
    // The tip mechanic only exists on backends that expose a hint endpoint.
    tip_menu_button.style.display = backend_supports_tips() ? 'block' : 'none';
    checked_words.clear();
    roundStartTime = Date.now();
    uniqUsers.clear();
    uniqWords = repeatWords = 0;
    hints_used = 0;
    reset_tips();
    best_found_distance = backend_max_distance();
    markOverlayActivity();
}

document.getElementById('test-win-btn').addEventListener('click', () => {
    const randomSuffix = Math.floor(Math.random() * 10000);
    process_message({ username: 'TestUser', 'display-name': 'TestUser' }, '#8A2BE2', 'WinWord' + randomSuffix, true);
});

document.getElementById('menu-button-info').addEventListener('click', () => {
    const infoSection = document.getElementById('info');
    infoSection.style.display = infoSection.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('menu-button-restart').addEventListener('click', () => {
    resetRoundTimeout(0);
    document.getElementById('menu-button-restart').style.display = 'none';
    resetTimerPaused = false;
});

document.getElementById('menu-timer').addEventListener('click', () => {
    const menuTimer = document.getElementById('menu-timer');
    const menuRestartButton = document.getElementById('menu-button-restart');
    if (is_game_finished) {
        menuTimer.style.display = 'none';
        menuRestartButton.style.display = 'block';
        clearTimeout(resetRoundTimeoutId);
        clearInterval(menuTimerId);
        resetTimerPaused = true;
    }
});
