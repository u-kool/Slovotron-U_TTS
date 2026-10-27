// Мост U_TTS: слушает шину WebSocket приложения (/ws) и кормит чат Словотрону.
// Заменяет собственное tmi-подключение: сообщения приходят со всех платформ,
// подключённых в панели «Подключения» (Twitch, VK Live и др.).
(function () {
    'use strict';

    if (typeof handle_chat_message !== 'function') {
        console.error('utts_bridge: handle_chat_message недоступен');
        return;
    }

    var current = null;
    var lastSeen = {};
    var lastSeenCount = 0;

    function connect() {
        if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;
        var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        var ws = new WebSocket(proto + '//' + location.host + '/ws');
        current = ws;

        ws.onmessage = function (ev) {
            try {
                var m = JSON.parse(ev.data);
                if (m.type === 'slv_leaderboard') {
                    if (typeof showLeaderboardTemporarily === 'function') showLeaderboardTemporarily();
                    return;
                }
                // чаты всех площадок: Twitch/YouTube/GoodGame идут общим типом "chat"
                // (platform различает), VK Video Live — отдельным типом "vk_video_live_chat"
                if ((m.type !== 'chat' && m.type !== 'vk_video_live_chat') || !m.data) return;
                var d = m.data;
                // только обычные сообщения чата: system/follow/announcement и пр. — не угадывания
                if (d.type !== 'chat' || !d.text) return;
                var name = String(d.user || '').trim();
                if (!name || d.user_is_system) return;

                var badgesInfo = Array.isArray(d.badges_info) ? d.badges_info : [];
                var isMod = badgesInfo.some(function (b) {
                    var s = b && b.set ? String(b.set).toLowerCase() : '';
                    return s.indexOf('moderator') !== -1 || s.indexOf('broadcaster') !== -1;
                });

                // дедупликация: чаты дублируются (эхо отправки через приложение на несколько
                // платформ, повторы MiniChat при реконнектах) — одно и то же слово от того же
                // пользователя в течение 5 секунд считаем одной догадкой
                var dedupKey = name.toLowerCase() + '|' + String(d.text).trim().toLowerCase();
                var now = Date.now();
                if (lastSeen[dedupKey] && now - lastSeen[dedupKey] < 5000) { return; }
                lastSeen[dedupKey] = now;
                if (++lastSeenCount % 200 === 0) {
                    for (var k in lastSeen) {
                        if (now - lastSeen[k] > 60000) delete lastSeen[k];
                    }
                }

                var user = {
                    username: name.toLowerCase(),
                    'display-name': name,
                    color: (typeof d.original_nick_color === 'string' && /^#/.test(d.original_nick_color)) ? d.original_nick_color : '',
                    mod: isMod,
                    badges: isMod ? { moderator: '1' } : {}
                };
                handle_chat_message(user, user.color, String(d.text));
            } catch (e) {
                console.error('utts_bridge:', e);
            }
        };

        ws.onclose = function () {
            setTimeout(connect, 3000);
        };
        ws.onerror = function () {
            ws.close();
        };
    }

    connect();

    // восстановление после «уснувшей» вкладки, если onclose не сработал
    setInterval(connect, 15000);
})();
