/* node tests/settings-edge.test.js
 * Edge drag: touch, mouse pointer, pen pointer and touch pointer share one progress.
 * p = subpageTranslateX / innerWidth. Root translateX = -0.3*vw*(1-p), opacity = 0.4+0.6p.
 */
var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('/tmp/puppeteer-run/node_modules/puppeteer-core');

var ROOT = path.join(__dirname, '..');
var WIDTHS = [390, 400];
var PROGRESS = [0.1, 0.3, 0.5, 0.8];
var KINDS = ['mouse', 'pen', 'touch-pointer', 'touch'];

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
        res.writeHead(200);
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

function txOf(tf) {
  if (!tf || tf === 'none') return 0;
  var m = tf.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!m) return null;
  var parts = m[1].split(',').map(function (n) { return parseFloat(n); });
  return parts.length === 16 ? parts[12] : parts[4];
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
  var queen = null;

  async function boot(page, width) {
    await page.setViewport({ width: width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:' + port + '/?edge=' + width + '-' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.addStyleTag({ content: '#authBoot,#authMask,#toast{display:none!important}body.auth-gated{overflow:auto!important}body.auth-gated #app > *{visibility:visible!important;pointer-events:auto!important}' });
    await page.waitForFunction(function () { return window.ZenFlow && document.documentElement.classList.contains('motion-ready'); });
    await page.evaluate(function () { window.ZenFlow.setTheme('light', false); window.scrollTo(0, 0); });
  }

  async function openAccount(page) {
    await page.evaluate(function () {
      window.scrollTo(0, 0);
      var root = document.getElementById('settingsRoot');
      var onAccount = root.classList.contains('hidden') && document.querySelector('.settings-page[data-settings-page="account"]') && !document.querySelector('.settings-page[data-settings-page="account"]').classList.contains('hidden');
      if (onAccount) return;
      if (!document.getElementById('screen-settings').classList.contains('active') || !root.classList.contains('hidden')) {
        document.querySelector('.tab[data-tab="settings"]').click();
      }
    });
    await sleep(80);
    var needOpen = await page.evaluate(function () {
      var pageEl = document.querySelector('.settings-page[data-settings-page="account"]');
      return !(pageEl && !pageEl.classList.contains('hidden') && document.getElementById('settingsRoot').classList.contains('hidden'));
    });
    if (needOpen) {
      await page.evaluate(function () {
        window.scrollTo(0, 0);
        if (!document.getElementById('screen-settings').classList.contains('active')) {
          document.querySelector('.tab[data-tab="settings"]').click();
        }
        var root = document.getElementById('settingsRoot');
        if (root.classList.contains('hidden')) {
          var back = document.querySelector('.settings-page:not(.hidden) .settings-back');
          if (back) back.click();
        }
      });
      await sleep(350);
      await page.evaluate(function () {
        window.scrollTo(0, 0);
        document.querySelector('#settingsRoot [data-settings="account"]').click();
      });
      await sleep(420);
    }
  }

  async function dragToProgress(page, kind, p) {
    return page.evaluate(function (kind, p) {
      var vw = window.innerWidth;
      var target = p * vw;
      var y = 520;
      var x0 = 8;
      var id = 7;
      function pointer(type, x, pointerType) {
        document.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          pointerId: id, pointerType: pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true, view: window
        }));
      }
      function touch(type, x) {
        var t = new Touch({ identifier: id, target: document.body, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
        document.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
          view: window
        }));
      }
      var endX = x0 + 12 + target;
      if (kind === 'touch') {
        touch('touchstart', x0);
        touch('touchmove', x0 + 12);
        touch('touchmove', endX);
      } else {
        var pointerType = kind === 'mouse' ? 'mouse' : (kind === 'pen' ? 'pen' : 'touch');
        pointer('pointerdown', x0, pointerType);
        pointer('pointermove', x0 + 12, pointerType);
        pointer('pointermove', endX, pointerType);
      }
      var root = document.getElementById('settingsRoot');
      var sub = document.querySelector('.settings-page[data-settings-page="account"]');
      var rs = getComputedStyle(root);
      var ps = getComputedStyle(sub);
      function txOf(tf) {
        if (!tf || tf === 'none') return 0;
        var m = tf.match(/matrix(?:3d)?\(([^)]+)\)/);
        if (!m) return null;
        var parts = m[1].split(',').map(function (n) { return parseFloat(n); });
        return parts.length === 16 ? parts[12] : parts[4];
      }
      var pageTx = txOf(ps.transform);
      var rootTx = txOf(rs.transform);
      var held = { vw: vw, pageTx: pageTx, rootTx: rootTx, rootOp: parseFloat(rs.opacity), pageOp: parseFloat(ps.opacity) };
      if (kind === 'touch') touch('touchend', endX);
      else pointer('pointerup', endX, kind === 'mouse' ? 'mouse' : (kind === 'pen' ? 'pen' : 'touch'));
      var rs2 = getComputedStyle(root);
      var ps2 = getComputedStyle(sub);
      held.afterTx = txOf(ps2.transform);
      held.afterRoot = txOf(rs2.transform);
      held.afterOp = parseFloat(rs2.opacity);
      held.afterTransition = ps2.transition;
      return held;
    }, kind, p);
  }

  try {
    for (var wi = 0; wi < WIDTHS.length; wi++) {
      var width = WIDTHS[wi];
      var page = await browser.newPage();
      page.on('pageerror', function (err) { console.log('PAGEERROR', err.message); });
      await boot(page, width);
      var inner = await page.evaluate(function () { return window.innerWidth; });
      assert.strictEqual(inner, width, 'innerWidth ' + inner + ' !== ' + width);
      for (var ki = 0; ki < KINDS.length; ki++) {
        var kind = KINDS[ki];
        for (var pi = 0; pi < PROGRESS.length; pi++) {
          var p = PROGRESS[pi];
          await openAccount(page);
          var got = await dragToProgress(page, kind, p);
          var label = width + ' ' + kind + ' p=' + p;
          var expectPage = p * got.vw;
          var expectRoot = -got.vw * 0.3 * (1 - p);
          var expectOp = 0.4 + 0.6 * p;
          var okPage = Math.abs(got.pageTx - expectPage) <= 0.75;
          var okRoot = Math.abs(got.rootTx - expectRoot) <= 0.75;
          var okOp = Math.abs(got.rootOp - expectOp) <= 0.02;
          var okPageOp = Math.abs(got.pageOp - 1) <= 0.02;
          var okStart = Math.abs(got.afterTx - expectPage) <= 0.75 && Math.abs(got.afterRoot - expectRoot) <= 0.75;
          if (!(okPage && okRoot && okOp && okPageOp && okStart)) {
            failures.push(label + ' pageTx=' + got.pageTx + ' rootTx=' + got.rootTx + ' op=' + got.rootOp + ' after=' + got.afterTx + '/' + got.afterRoot + ' want ' + expectPage + '/' + expectRoot + '/' + expectOp);
            console.log('FAIL', label, JSON.stringify(got));
          } else {
            console.log('ok', label, 'rootTx', Math.round(got.rootTx * 10) / 10, 'op', Math.round(got.rootOp * 1000) / 1000, 'pageTx', Math.round(got.pageTx * 10) / 10);
          }
          if (width === 400 && kind === 'mouse' && p === 0.3) queen = got;
          await sleep(p >= 0.5 ? 420 : 320);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('QUEEN400', queen ? JSON.stringify(queen) : 'missing');
  if (failures.length) {
    failures.forEach(function (f) { console.log(' - ' + f); });
    process.exit(1);
  }
  console.log('all passed');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
