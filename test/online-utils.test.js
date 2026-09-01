import assert from 'node:assert/strict';
import { buildRoomInviteUrl, copyTextToClipboard } from '../js/online-utils.js';

assert.equal(
  buildRoomInviteUrl({
    origin: 'http://192.168.1.20:8000',
    protocol: 'http:',
    host: '192.168.1.20:8000',
    pathname: '/',
  }, 'a7k9qx'),
  'http://192.168.1.20:8000/?room=A7K9QX',
);

assert.equal(
  buildRoomInviteUrl({
    origin: 'https://chess.example.com',
    protocol: 'https:',
    host: 'chess.example.com',
    pathname: '/game/',
  }, 'ABC123'),
  'https://chess.example.com/game/?room=ABC123',
);

assert.throws(
  () => buildRoomInviteUrl({ origin: 'http://localhost:8000', pathname: '/' }, 'bad'),
  /无效的军帐编号/,
);

let copied = '';
await copyTextToClipboard('invite', {
  clipboard: { writeText: async value => { copied = value; } },
});
assert.equal(copied, 'invite');

let fallbackValue = '';
let removed = false;
const textarea = {
  value: '',
  style: {},
  setAttribute() {},
  select() {},
  setSelectionRange() {},
  remove() { removed = true; },
};
await copyTextToClipboard('fallback', {
  clipboard: { writeText: async () => { throw new Error('not allowed'); } },
}, {
  body: { appendChild(node) { fallbackValue = node.value; } },
  createElement() { return textarea; },
  execCommand(command) { return command === 'copy'; },
});
assert.equal(fallbackValue, 'fallback');
assert.equal(removed, true);

console.log('ok - 联机邀请链接与剪贴板回退');
