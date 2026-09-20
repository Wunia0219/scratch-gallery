function createLeaderboardBridge(gameId) {
  return `(() => {
    'use strict';
    const channel = 'scratch-gallery-leaderboard-v1';
    const gameId = ${JSON.stringify(gameId)};
    const names = {
      refresh: '\u6392\u884c\u699c\u66f4\u65b0\u8acb\u6c42',
      submit: '\u6392\u884c\u699c\u9001\u51fa\u8acb\u6c42',
      player: '\u73a9\u5bb6', floor: '\u6a13\u5c64', score: '\u5206\u6578',
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
    };
    addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || !data || data.channel !== channel || data.gameId !== gameId || data.action !== 'result') return;
      apply(data.leaderboard);
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
