// Настройки Словотрона в режиме U_TTS.
// Источник — хранилище темы «slovotron» в приложении (/api/overlay/settings?theme=slovotron).
// Загрузчик, инжектируемый сервером в /overlay/{theme}, сам раз в 3 секунды читает
// настройки и вызывает applyOvSettings(), поэтому значения применяются на лету.
// Встроенная панель настроек оверлея (⚙) скрыта — настройки переехали в приложение.
(function () {
    'use strict';

    // скрыть штатную панель настроек, кнопку ⚙, кнопки меню (💡/ℹ️/🏆), приветствие
    // и ссылку GitHub (элементы остаются в DOM —
    // settings.js/leaderboard.js/ws.js навешивают обработчики без null-проверок).
    // #leaderboard-statistic НЕ прячем: команды !слв-топ/!словотрон-топ и победа
    // показывают таблицу сами (изначально она скрыта inline-стилем в index.html).
    var st = document.createElement('style');
    st.textContent = '#settings,#menu-button-settings,#menu-button-tip,#menu-button-info,'
        + '#menu-button-leaderboard,#info,.github-link{display:none!important}'
        // затухание при простое: те же правила, что в style.css, но без требования .obs-overlay
        + '.guessing .last-words,.guessing .best-match{transition:opacity 0.6s ease}'
        + '.overlay-words-idle .guessing .last-words,.overlay-words-idle .guessing .best-match,.overlay-words-idle #utts-last-word,.overlay-words-idle #utts-last-word .msg{opacity:var(--overlay-idle-opacity,0.35)}';
    document.head.appendChild(st);

    // Режим «блоков слов» (slv_word_layout из панели настроек оверлея):
    //  - 'contextno' — один столбик: сверху последнее слово (#utts-last-word), ниже —
    //    до 10 ближайших (.best-match); штатный .last-words при этом перенаправляется в
    //    #utts-last-word наблюдающей за ним функцией ниже;
    //  - 'classic' — как в оригинальной игре: .last-words (дублирует слова по мере ввода)
    //    и .best-match в два столбика; #utts-last-word скрыт.
    window.slvWordLayout = 'contextno';
    var layoutStyle = document.createElement('style');
    layoutStyle.id = 'slv-word-layout-style';
    document.head.appendChild(layoutStyle);

    function setSlvWordLayout(mode) {
        var layout = (mode === 'classic') ? 'classic' : 'contextno';
        window.slvWordLayout = layout;
        layoutStyle.textContent = layout === 'classic'
            ? '#utts-last-word{display:none!important}'
            // один столбик вместо двух: последнее слово сверху, ниже — ближайшие результаты
            : '.guessing{flex-direction:column}'
            + '.guessing .last-words{display:none}'
            + '.guessing .msg.last-words{border:none}';
        // при переключении на «Классический» отдать слова обратно в их родной блок
        var guessing = document.querySelector('.guessing');
        var lw = guessing && guessing.querySelector('.last-words');
        var box = document.getElementById('utts-last-word');
        if (lw && box) {
            if (layout === 'classic') {
                while (box.firstElementChild) lw.appendChild(box.firstElementChild);
            } else if (!box.firstElementChild) {
                // при возврате в «Контекстно» показать во всплывающем блоке актуальное
                // последнее слово (в «Классическом» оно лежит в ленте .last-words)
                while (lw.children.length > 1) lw.removeChild(lw.lastElementChild);
                if (lw.firstElementChild) box.appendChild(lw.firstElementChild);
            }
        }
    }
    setSlvWordLayout('contextno');
    window.setSlvWordLayout = setSlvWordLayout;

    // перенос последнего слова из скрытого .last-words в блок над .best-match
    function setupMergedLayout() {
        var guessing = document.querySelector('.guessing');
        var lw = guessing && guessing.querySelector('.last-words');
        var bm = guessing && guessing.querySelector('.best-match');
        if (!guessing || !lw || !bm || document.getElementById('utts-last-word')) return;
        var box = document.createElement('div');
        box.id = 'utts-last-word';
        guessing.insertBefore(box, bm);
        new MutationObserver(function () {
            if (window.slvWordLayout !== 'contextno') return; // в «Классическом» .last-words видим сам
            while (lw.firstElementChild) box.appendChild(lw.firstElementChild);
            while (box.children.length > 1) box.removeChild(box.firstElementChild);
        }).observe(lw, { childList: true });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMergedLayout);
    } else {
        setupMergedLayout();
    }

    // Затухание при простое: в оригинале работает только с ?obs-overlay=1 в URL.
    // Здесь оверлей всегда затухает — переопределяю обе функции без проверки obs-режима
    // (вручную введённый guess и остальная логика остаются доступны).
    window.setOverlayIdleState = function (isIdle) {
        if (overlay_idle_timeout <= 0) return;
        if (isIdle && is_game_finished) return; // не затухаем на экране победы
        is_overlay_idle = isIdle;
        document.body.classList.toggle('overlay-words-idle', isIdle);
    };
    window.markOverlayActivity = function () {
        if (overlay_idle_timeout <= 0) return;
        setOverlayIdleState(false);
        if (overlay_idle_timeout_id) clearTimeout(overlay_idle_timeout_id);
        overlay_idle_timeout_id = setTimeout(function () { setOverlayIdleState(true); }, overlay_idle_timeout * 1000);
    };

    // публикация таблицы лидеров в хранилище темы (для панели «Настройки оверлея»)
    var _publishTimer = null;
    window.__slvPublishLeaderboard = function () {
        if (typeof getLeaderboardData !== 'function') return;
        clearTimeout(_publishTimer);
        _publishTimer = setTimeout(function () {
            fetch('/api/overlay/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: 'slovotron', slv_leaderboard: getLeaderboardData() })
            }).catch(function () {});
        }, 500);
    };

    window.__slvPublishGameKey = function (gameId, gameData) {
        if (!gameId) return;
        fetch('/api/overlay/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: 'slovotron', slv_game_key: gameId, slv_game_data: gameData || null })
        }).catch(function () {});
    };

    // на window: инжектируемый загрузчик проверяет typeof ovSettings и присваивает сюда
    window.ovSettings = null;

    window.applyOvSettings = function () {
        var ovSettings = window.ovSettings;
        if (!ovSettings || typeof ovSettings !== 'object') return;
        var hasSlv = Object.keys(ovSettings).some(function (k) { return k.indexOf('slv_') === 0; });
        if (!hasSlv) return; // тема без сохранённых настроек — работают дефолты игры

        var num = function (k, d) { var v = Number(ovSettings[k]); return Number.isFinite(v) ? v : d; };

        restart_time = Math.max(0, num('slv_restart_time', restart_time));
        sound_enable = ovSettings.slv_sound_enable !== false;
        win_avatar_enable = ovSettings.slv_win_avatar_enable === true;
        manual_guess_enable = ovSettings.slv_manual_guess_enable === true;
        show_nicknames = ovSettings.slv_show_nicknames !== false;
        if (typeof ovSettings.slv_game_key === 'string' && ovSettings.slv_game_key) {
            if (ovSettings.slv_game_key !== secret_word_id) {
                secret_word_id = ovSettings.slv_game_key;
                if (ovSettings.slv_game_data && typeof ovSettings.slv_game_data === 'object') {
                    current_secret_word_data = ovSettings.slv_game_data;
                }
                console.log('Shared game key applied: ', secret_word_id);
                // сбросить раунд при смене ключа игры
                if (typeof reset_round === 'function') reset_round();
                is_game_finished = false;
                setManualGuessReady(true);
            }
        }

        if (typeof ovSettings.slv_win_sound_url === 'string') {
            win_sound_url = ovSettings.slv_win_sound_url.trim();
        }
        if (typeof ovSettings.slv_win_voice === 'string') {
            win_voice = ovSettings.slv_win_voice.trim();
        }
        // Голосовые блоки «Настройка: голос победы»: шаблоны с {UserName}/{Word}
        // и настройками голоса. Пустой/битый список игнорируем — работает win_voice.
        if (Array.isArray(ovSettings.slv_win_blocks)) {
            win_blocks = ovSettings.slv_win_blocks.filter(function (b) {
                return b && typeof b.voice === 'string' && b.voice && b.voice.indexOf('__') !== 0;
            });
        }
        if (GAME_BACKENDS[ovSettings.slv_game_backend]) {
            game_backend = ovSettings.slv_game_backend;
        }
        if (typeof ovSettings.slv_wordgun_difficulty === 'string') {
            wordgun_difficulty = ovSettings.slv_wordgun_difficulty.trim();
        }
        if (typeof ovSettings.slv_word_layout === 'string') {
            setSlvWordLayout(ovSettings.slv_word_layout);
        }
        if (typeof ovSettings.slv_bg_opacity === 'number') {
            document.body.style.setProperty('--slv-bg-opacity', (100 - ovSettings.slv_bg_opacity) / 100);
        }

        overlay_idle_timeout = Math.max(0, num('slv_inactive_timeout', overlay_idle_timeout));
        var op = num('slv_inactive_opacity', NaN);
        if (Number.isFinite(op)) {
            overlay_idle_opacity = Math.min(1, Math.max(0, 1 - op / 100));
        }
        document.body.style.setProperty('--overlay-idle-opacity', overlay_idle_opacity);

        if (typeof updateManualGuessVisibility === 'function') updateManualGuessVisibility();
        if (typeof updateBackendSettings === 'function') updateBackendSettings();

        applySlvAction();
    };

    // кнопки панели «Настройки оверлея» приходят как slv_action/slv_action_id
    var _lastActionId = 0;
    function applySlvAction() {
        var id = Number(ovSettings.slv_action_id) || 0;
        var action = ovSettings.slv_action;
        if (!id || !action || id === _lastActionId) return;
        _lastActionId = id;
        try {
            if (action === 'hint' && typeof use_tip === 'function') {
                use_tip('', true);
            } else if (action === 'info') {
                var info = document.getElementById('info');
                if (info) {
                    info.style.display = 'block';
                    clearTimeout(applySlvAction._infoTimer);
                    applySlvAction._infoTimer = setTimeout(function () { info.style.display = 'none'; }, 10000);
                }
            } else if (action === 'show_leaderboard' && typeof showLeaderboardTemporarily === 'function') {
                // кнопка 🏆 в поле ввода главного окна: показать таблицу на время раунда
                showLeaderboardTemporarily();
            } else if (action === 'test_win' && typeof process_message === 'function') {
                var suffix = Math.floor(Math.random() * 10000);
                process_message({ username: 'TestUser', 'display-name': 'TestUser' }, '#8A2BE2', 'WinWord' + suffix, true);
            } else if (action === 'reset_leaderboard' && typeof getLeaderboardData === 'function') {
                // без resetLeaderboard(): там confirm() — в оверлее для OBS это не нужно
                localStorage.removeItem('word_game_leaderboard');
                if (typeof renderLeaderboard === 'function') renderLeaderboard();
                window.__slvPublishLeaderboard();
            }
        } catch (e) {
            console.error('slv_action:', e);
        }
    }
})();
