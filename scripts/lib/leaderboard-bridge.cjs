function createLeaderboardBridge(gameId) {
  return `(() => {
    'use strict';
    const channel = 'scratch-gallery-leaderboard-v1';
    const gameId = ${JSON.stringify(gameId)};
    const names = {
      refresh: '\u6392\u884c\u699c\u66f4\u65b0\u8acb\u6c42',
      submit: '\u6392\u884c\u699c\u9001\u51fa\u8acb\u6c42',
      player: '送出玩家', floor: '送出樓層', score: '送出分數',
      players: '\u6392\u884c\u73a9\u5bb6', floors: '\u6392\u884c\u6a13\u5c64', scores: '\u6392\u884c\u5206\u6578'
    };
    let lastRefresh;
    let lastSubmit;
    const send = (action, payload = {}) => parent.postMessage({ channel, action, gameId, ...payload }, '*');
    const apply = entries => {
      if (!Array.isArray(entries)) return;
      const safe = entries.slice(0, 5);
      scaffolding.setList(names.players, safe.map(entry => String(entry.player)));
      scaffolding.setList(names.floors, safe.map(entry => Number(entry.floor)));
      scaffolding.setList(names.scores, safe.map(entry => Number(entry.score)));
      const runtime = scaffolding.vm.runtime;
      const panel = runtime.getSpriteTargetByName('排行榜面板');
      const glyph = runtime.getSpriteTargetByName('排行榜字元');
      if (panel?.visible && glyph) {
        runtime.stopForTarget(glyph);
        for (const clone of glyph.sprite.clones.slice(1)) {
          runtime.stopForTarget(clone);
          runtime.disposeTarget(clone);
        }
        runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: '顯示排行榜' }, glyph);
      }
    };
    addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || !data || data.channel !== channel || data.gameId !== gameId) return;
      if (data.action === 'result') apply(data.leaderboard);
      if (data.action === 'status' && typeof data.message === 'string') scaffolding.setVariable('狀態', data.message);
    });
    setInterval(() => {
      try {
        const refresh = Number(scaffolding.getVariable(names.refresh));
        const submit = Number(scaffolding.getVariable(names.submit));
        if (lastRefresh === undefined) lastRefresh = refresh;
        else if (refresh < lastRefresh) lastRefresh = refresh;
        else if (refresh > lastRefresh) { lastRefresh = refresh; send('load'); }
        if (lastSubmit === undefined) lastSubmit = submit;
        else if (submit < lastSubmit) lastSubmit = submit;
        else if (submit > lastSubmit) {
          lastSubmit = submit;
          send('submit', {
            eventId: crypto.randomUUID(),
            player: String(scaffolding.getVariable(names.player)),
            floor: Number(scaffolding.getVariable(names.floor)),
            score: Number(scaffolding.getVariable(names.score))
          });
        }
      } catch (_) {}
    }, 100);
  })();`
}

module.exports = { createLeaderboardBridge }
