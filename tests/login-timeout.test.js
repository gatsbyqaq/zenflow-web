/* node tests/login-timeout.test.js
 * Startup remote connect is capped at 10s. Timeout or network failure
 * leaves local mode and opens one card: 「连接超时」 / 「数据已保存在本机」.
 * 「重试」 swaps that same card to a spinner and back; 「本机模式」 dismisses it.
 */
var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');
var puppeteer = require('/tmp/puppeteer-run/node_modules/puppeteer-core');

var ROOT = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(ROOT, 'cloud.js'), 'utf8');

function extract(name) {
  var key = 'function ' + name + '(';
  var start = src.indexOf(key);
  if (start < 0) throw new Error('missing ' + name);
  var i = src.indexOf('{', start);
  var depth = 0;
  for (var j = i; j < src.length; j++) {
    var ch = src.charAt(j);
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

var bundle = ['errText', 'connectTimeoutMs', 'isConnectFailure'].map(extract).join('\n');
var ctx = new Function('window', bundle + '\nreturn { connectTimeoutMs: connectTimeoutMs, isConnectFailure: isConnectFailure };')(global.window = global.window || {});
assert.strictEqual(ctx.connectTimeoutMs(), 10000);
global.window.ZF_CONNECT_TIMEOUT_MS = 250;
assert.strictEqual(ctx.connectTimeoutMs(), 250);
delete global.window.ZF_CONNECT_TIMEOUT_MS;
assert.strictEqual(ctx.isConnectFailure(null), false);
assert.strictEqual(ctx.isConnectFailure({ name: 'AbortError', message: 'The user aborted a request.' }), true);
assert.strictEqual(ctx.isConnectFailure({ name: 'AuthRetryableFetchError', message: 'Load failed' }), true);
assert.strictEqual(ctx.isConnectFailure({ message: 'Failed to fetch' }), true);
assert.strictEqual(ctx.isConnectFailure({ status: 503, message: 'unavailable' }), true);
assert.strictEqual(ctx.isConnectFailure({ status: 540, message: 'paused' }), true);
assert.strictEqual(ctx.isConnectFailure({ name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' }), false);
assert.ok(src.indexOf('new AbortController') >= 0);
assert.ok(src.indexOf('正在登录') >= 0);

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function startServer() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var url = (req.url || '/').split('?')[0];
      if (url === '/') url = '/index.html';
      var file = path.join(ROOT, decodeURIComponent(url));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, function (err, buf) {
        if (err) { res.writeHead(404); res.end(); return; }
        var type = path.extname(file) === '.html' ? 'text/html' : path.extname(file) === '.js' ? 'text/javascript' : path.extname(file) === '.css' ? 'text/css' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

function session(expired) {
  return {
    access_token: 'header.payload.sig',
    refresh_token: 'refresh-token',
    expires_at: expired ? 1 : Math.floor(Date.now() / 1000) + 3600,
    expires_in: expired ? 0 : 3600,
    token_type: 'bearer',
    user: { id: 'user-id', aud: 'authenticated', role: 'authenticated', email: 'a@b.c' }
  };
}

(async function () {
  var server = await startServer();
  var port = server.address().port;
  var browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  var failures = [];

  function note(ok, label, extra) {
    if (ok) console.log('ok', label);
    else { failures.push(label + (extra ? ' ' + extra : '')); console.log('FAIL', label, extra || ''); }
  }

  async function open(opts) {
    var page = await browser.newPage();
    var hung = [];
    var gate = { mode: opts.mode || 'hang' };
    page.on('pageerror', function (err) { console.log('PAGEERROR', err.message); });
    await page.setRequestInterception(true);
    page.on('request', function (req) {
      var url = req.url();
      if (!/supabase\.co/i.test(url)) { req.continue().catch(function () {}); return; }
      var cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': req.headers()['access-control-request-headers'] || '*',
        'Access-Control-Max-Age': '86400'
      };
      if (gate.mode === 'hang') { hung.push(req); return; }
      if (gate.mode === 'fail') { req.abort('failed').catch(function () {}); return; }
      if (req.method() === 'OPTIONS') {
        req.respond({ status: 204, headers: cors }).catch(function () {});
        return;
      }
      req.respond({
        status: 400,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token', msg: 'Invalid Refresh Token' })
      }).catch(function () {});
    });
    await page.evaluateOnNewDocument(function (ms, sess) {
      window.ZF_CONNECT_TIMEOUT_MS = ms;
      try { localStorage.setItem('zenflow_auth', JSON.stringify(sess)); } catch (e) {}
    }, opts.timeoutMs, opts.session);
    if (opts.reduced) {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    }
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    var started = Date.now();
    await page.goto('http://127.0.0.1:' + port + '/?t=' + started, { waitUntil: 'domcontentloaded', timeout: 20000 });
    page._zf = { gate: gate, hung: hung, started: started };
    return page;
  }

  async function release(page) {
    var bag = page._zf;
    if (!bag) return;
    bag.gate.mode = 'fail';
    bag.hung.splice(0).forEach(function (req) { try { req.abort('failed'); } catch (e) {} });
  }

  async function waitCard(page, timeout) {
    await page.waitForFunction(function () {
      var mask = document.getElementById('connectTimeout');
      var title = document.getElementById('connectTimeoutTitle');
      return mask && !mask.classList.contains('hidden') && title && title.textContent === '连接超时' &&
        !document.getElementById('connectFace').classList.contains('hidden');
    }, { timeout: timeout || 8000 });
  }

  try {
    var hang = await open({ mode: 'hang', timeoutMs: 600, session: session(true) });
    await waitCard(hang, 4000);
    var elapsed = Date.now() - hang._zf.started;
    await hang.waitForFunction(function () {
      var mask = document.getElementById('connectTimeout');
      var card = document.querySelector('.connect-card');
      return mask.classList.contains('is-open') && card && card.offsetWidth === 280;
    }, { timeout: 2000 });
    await sleep(350);
    var measured = await hang.evaluate(function () {
      var mask = document.getElementById('connectTimeout');
      var card = mask.querySelector('.connect-card');
      var boot = document.getElementById('authBoot');
      var gray = document.getElementById('connectLocal');
      var retry = document.getElementById('connectRetry');
      var icon = card.querySelector('.connect-ico');
      var cs = getComputedStyle(card);
      var ms = getComputedStyle(mask);
      var bootCs = getComputedStyle(boot);
      function rgb(c) { return c.replace(/\s/g, ''); }
      return {
        bootText: document.getElementById('authBootText').textContent,
        bootDisplay: bootCs.display,
        booting: document.body.classList.contains('auth-booting'),
        gated: document.body.classList.contains('auth-gated'),
        ready: document.body.classList.contains('auth-ready'),
        local: window.ZFCloud.status().localMode,
        title: document.getElementById('connectTimeoutTitle').textContent,
        sub: document.getElementById('connectTimeoutSub').textContent,
        buttons: [gray.textContent, retry.textContent],
        width: card.offsetWidth,
        iconW: Math.round(icon.getBoundingClientRect().width),
        iconH: Math.round(icon.getBoundingClientRect().height),
        radius: cs.borderRadius,
        cardBg: rgb(cs.backgroundColor),
        overlay: rgb(ms.backgroundColor),
        grayBg: rgb(getComputedStyle(gray).backgroundColor),
        grayColor: rgb(getComputedStyle(gray).color),
        retryBg: rgb(getComputedStyle(retry).backgroundColor),
        retryColor: rgb(getComputedStyle(retry).color),
        cssBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        cssText: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
        spinHidden: document.getElementById('connectSpin').classList.contains('hidden'),
        transform: cs.transform,
        transition: cs.transitionProperty
      };
    });
    note(elapsed >= 500 && elapsed < 3500, 'hang timeout window', String(elapsed));
    note(measured.bootText === '正在登录', 'boot text', measured.bootText);
    note(measured.bootDisplay === 'none' && !measured.booting, 'no splash behind card', measured.bootDisplay + '/' + measured.booting);
    note(!measured.gated && measured.ready && measured.local, 'local mode', JSON.stringify({ gated: measured.gated, ready: measured.ready, local: measured.local }));
    note(measured.title === '连接超时' && measured.sub === '数据已保存在本机', 'copy', measured.title + '/' + measured.sub);
    note(measured.buttons[0] === '本机模式' && measured.buttons[1] === '重试', 'buttons', measured.buttons.join(','));
    note(measured.width === 280 && measured.radius === '16px', 'card box', measured.width + '/' + measured.radius);
    note(measured.overlay === 'rgba(0,0,0,0.4)', 'overlay', measured.overlay);
    note(measured.cardBg === 'rgb(245,245,247)', 'panel light', measured.cardBg);
    note(measured.grayBg === 'rgb(229,229,234)' && measured.retryBg === 'rgb(0,0,0)' && measured.retryColor === 'rgb(255,255,255)', 'buttons light', measured.grayBg + ' ' + measured.retryBg + ' ' + measured.retryColor);
    note(measured.iconW === 24 && measured.iconH === 24, 'icon', measured.iconW + 'x' + measured.iconH);
    note(measured.spinHidden, 'timeout face has no spinner');
    note(measured.transition.indexOf('transform') >= 0, 'panel scale transition', measured.transition);

    await hang.evaluate(function () { window.ZenFlow.setTheme('dark', false); });
    await sleep(250);
    var dark = await hang.evaluate(function () {
      function rgb(c) { return c.replace(/\s/g, ''); }
      var card = document.querySelector('.connect-card');
      var retry = document.getElementById('connectRetry');
      var root = getComputedStyle(document.documentElement);
      return {
        cardBg: rgb(getComputedStyle(card).backgroundColor),
        grayBg: rgb(getComputedStyle(document.getElementById('connectLocal')).backgroundColor),
        retryBg: rgb(getComputedStyle(retry).backgroundColor),
        retryColor: rgb(getComputedStyle(retry).color),
        bg: root.getPropertyValue('--bg').trim(),
        text: root.getPropertyValue('--text').trim(),
        theme: document.documentElement.getAttribute('data-theme')
      };
    });
    note(dark.cardBg === 'rgb(28,28,30)', 'panel dark', dark.cardBg);
    note(dark.grayBg === 'rgb(44,44,46)' && dark.retryBg === 'rgb(255,255,255)' && dark.retryColor === 'rgb(0,0,0)', 'buttons dark', JSON.stringify(dark));
    await hang.evaluate(function () { window.ZenFlow.setTheme('light', false); });

    await hang.evaluate(function () { document.querySelector('.connect-card').dataset.mark = 'stay'; });
    await hang.click('#connectRetry');
    await hang.waitForFunction(function () {
      var spin = document.getElementById('connectSpin');
      var mask = document.getElementById('connectTimeout');
      return spin && !spin.classList.contains('hidden') && mask.classList.contains('is-open') && !mask.classList.contains('hidden') &&
        document.querySelector('.connect-card').dataset.mark === 'stay' && getComputedStyle(document.getElementById('authBoot')).display === 'none';
    }, { timeout: 2000 });
    note(true, 'retry spinner in place');
    await waitCard(hang, 4000);
    var same = await hang.evaluate(function () {
      return document.querySelector('.connect-card').dataset.mark === 'stay' &&
        document.getElementById('connectTimeout').classList.contains('is-open');
    });
    note(same, 'timeout returns in the same card');

    await hang.click('#connectLocal');
    await hang.waitForFunction(function () {
      return document.getElementById('connectTimeout').classList.contains('hidden');
    }, { timeout: 2000 });
    await hang.evaluate(function () { document.querySelector('.tab[data-tab="log"]').click(); });
    var usable = await hang.evaluate(function () {
      return document.getElementById('screen-log').classList.contains('active') &&
        !document.body.classList.contains('auth-booting') &&
        !document.body.classList.contains('auth-gated') &&
        window.ZFCloud.status().localMode === true;
    });
    note(usable, 'local mode stays usable');
    await release(hang);
    await hang.close();

    var fast = await open({ mode: 'fail', timeoutMs: 10000, session: session(true) });
    var t0 = Date.now();
    await waitCard(fast, 4000);
    var fastMs = Date.now() - t0;
    note(fastMs < 2000, 'network failure does not wait 10s', String(fastMs));
    await release(fast);
    await fast.close();

    var profile = await open({ mode: 'hang', timeoutMs: 600, session: session(false) });
    await waitCard(profile, 4000);
    var profileLocal = await profile.evaluate(function () { return window.ZFCloud.status().localMode === true; });
    note(profileLocal, 'profile wait shares the cap');
    await release(profile);
    await profile.close();

    var again = await open({ mode: 'hang', timeoutMs: 2000, session: session(true) });
    await waitCard(again, 4000);
    again._zf.gate.mode = 'auth400';
    again._zf.hung.splice(0).forEach(function (req) { try { req.abort('failed'); } catch (e) {} });
    await again.click('#connectRetry');
    await again.waitForFunction(function () {
      var mask = document.getElementById('connectTimeout');
      return mask.classList.contains('hidden') && document.body.classList.contains('auth-gated') &&
        window.ZFCloud.status().localMode === false;
    }, { timeout: 8000 });
    note(true, 'retry success closes the card');
    await release(again);
    await again.close();

    var reduced = await open({ mode: 'hang', timeoutMs: 400, session: session(true), reduced: true });
    await waitCard(reduced, 4000);
    var motion = await reduced.evaluate(function () {
      var card = document.querySelector('.connect-card');
      var mask = document.getElementById('connectTimeout');
      return {
        transform: getComputedStyle(card).transform,
        cardTransition: getComputedStyle(card).transitionProperty,
        maskTransition: getComputedStyle(mask).transitionProperty
      };
    });
    note(motion.transform === 'none', 'reduced motion has no scale', motion.transform);
    note(motion.cardTransition === 'none' || motion.cardTransition.indexOf('transform') < 0, 'reduced card does not scale', motion.cardTransition);
    note(motion.maskTransition.indexOf('opacity') >= 0, 'reduced motion still fades', motion.maskTransition);
    await release(reduced);
    await reduced.close();
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    failures.forEach(function (f) { console.log(' - ' + f); });
    process.exit(1);
  }
  console.log('login-timeout.test.js ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
