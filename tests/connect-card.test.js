/* node tests/connect-card.test.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
assert.ok(html.indexOf('id="connectSpinText"') >= 0);
assert.ok(html.indexOf('正在连接') >= 0);
assert.ok(css.indexOf('.connect-spin{') >= 0 && css.indexOf('position:absolute') >= 0);
assert.ok(css.indexOf('.connect-face-hold{visibility:hidden}') >= 0);
assert.ok(html.indexOf('id="accountDeleteRow"') >= 0);
assert.ok(html.indexOf('id="btnDeleteAccountJump"') >= 0);
assert.ok(html.indexOf('sync-merge.js') >= 0);
console.log('connect-card markup ok');
