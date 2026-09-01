const ROOM_ID_PATTERN = /^[A-Z0-9]{6}$/;

export function buildRoomInviteUrl(locationLike, roomId) {
  const room = String(roomId ?? '').trim().toUpperCase();
  if (!ROOM_ID_PATTERN.test(room)) throw new Error('无效的军帐编号');

  const origin = locationLike.origin && locationLike.origin !== 'null'
    ? locationLike.origin
    : `${locationLike.protocol}//${locationLike.host}`;
  const invite = new URL(locationLike.pathname || '/', origin);
  invite.searchParams.set('room', room);
  return invite.toString();
}

export async function copyTextToClipboard(text, navigatorLike = globalThis.navigator, documentLike = globalThis.document) {
  if (navigatorLike?.clipboard?.writeText) {
    try {
      await navigatorLike.clipboard.writeText(text);
      return;
    } catch (_) {
      // HTTP 局域网页面可能无权使用 Clipboard API，继续使用同步回退方案。
    }
  }

  if (!documentLike?.body || typeof documentLike.execCommand !== 'function') {
    throw new Error('浏览器不支持自动复制');
  }

  const textarea = documentLike.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  documentLike.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    if (!documentLike.execCommand('copy')) throw new Error('浏览器拒绝复制');
  } finally {
    textarea.remove();
  }
}
