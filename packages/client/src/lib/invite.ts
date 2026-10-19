/**
 * Enlace de invitación: la página con ?sala=CÓDIGO abre el inicio con ese código ya puesto, así
 * el que lo recibe solo escribe su nombre y entra.
 */
import { normalizeRoomCode } from '@borracho/protocol';

export const INVITE_PARAM = 'sala';

export function inviteUrl(code: string, origin: string = window.location.origin): string {
  return `${origin}/?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}

/** El código de la invitación de la dirección, si hay uno válido. */
export function invitedCode(search: string = window.location.search): string | null {
  const raw = new URLSearchParams(search).get(INVITE_PARAM);
  return raw ? normalizeRoomCode(raw) : null;
}

/** Saca la invitación de la dirección (para que recargar no la vuelva a ofrecer). */
export function clearInvite(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(INVITE_PARAM)) return;
    url.searchParams.delete(INVITE_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Sin History API: no pasa nada, solo queda en la dirección.
  }
}
