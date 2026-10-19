import { useState, type FormEvent } from 'react';
import { PLAYER_LIMITS, normalizeName, normalizeRoomCode } from '@borracho/protocol';
import type { OnlineClient, OnlineState } from '../net/OnlineClient';
import { clearInvite, invitedCode } from '../lib/invite';
import { readStorage, writeStorage } from '../lib/util';
import { GlassLogo, ResumeIcon } from '../components/icons';

const NAME_KEY = 'borracho.name';

export function HomeScreen({ client, state }: { client: OnlineClient; state: OnlineState }) {
  const [name, setName] = useState(() => readStorage<string>('local', NAME_KEY) ?? '');
  const [code, setCode] = useState(() => invitedCode() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invited = invitedCode() !== null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setError(null);
    client.dismissNotice();
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) setError(result.error?.message ?? 'Algo salió mal.');
    else clearInvite();
  };

  const cleanName = () => {
    const n = normalizeName(name);
    if (!n) {
      setError('Escribí tu nombre primero.');
      return null;
    }
    writeStorage('local', NAME_KEY, n);
    return n;
  };

  const create = () => {
    const n = cleanName();
    if (n) void run(() => client.create(n, PLAYER_LIMITS.max));
  };

  const join = (e?: FormEvent) => {
    e?.preventDefault();
    const n = cleanName();
    if (!n) return;
    const c = normalizeRoomCode(code);
    if (!c) {
      setError('El código tiene 6 caracteres, letras y números.');
      return;
    }
    void run(() => client.join(n, c));
  };

  if (state.resume === 'resuming' && state.session) {
    return (
      <main className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p className="muted">Volviendo a la partida…</p>
      </main>
    );
  }

  return (
    <main className="screen" style={{ gap: 24 }}>
      <div className="logo">
        <div className="logo-cards" aria-hidden="true">
          <div className="back" />
          <div className="front">
            <GlassLogo />
          </div>
        </div>
        <div>
          <div className="pre">EL MÁS</div>
          <h1>BORRACHO</h1>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 15 }}>
            Armá cócteles, hacé tomar a los demás, no te pases del 100%.
          </p>
        </div>
      </div>

      {state.notice ? <div className="error">{state.notice}</div> : null}
      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : null}

      {state.resume === 'conflict' ? (
        <div className="resume-box">
          <div className="spacer">
            <div style={{ fontWeight: 600 }}>Tu partida está abierta en otra pestaña</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Si la usás acá, la otra se cierra.
            </div>
          </div>
          <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => void run(() => client.resumeLast(true))}>
            USAR ACÁ
          </button>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="nombre" className="label">
          Tu nombre
        </label>
        <input id="nombre" className="input" type="text" value={name} maxLength={20} autoComplete="nickname" placeholder="Cómo te dicen" onChange={(e) => setName(e.target.value)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {invited ? null : (
          <button type="button" className="btn btn-bordo" disabled={busy} onClick={create}>
            Crear partida
          </button>
        )}
        <form className="row" onSubmit={join}>
          <input
            className="input input-code"
            style={{ flex: 1, height: 54 }}
            aria-label="Código de la sala"
            placeholder="CÓDIGO"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className={`btn ${invited ? 'btn-bordo' : 'btn-ghost'}`} disabled={busy}>
            Unirme
          </button>
        </form>
        {invited ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearInvite(); setCode(''); window.location.reload(); }}>
            Mejor creo una partida
          </button>
        ) : null}
      </div>

      {state.lastSession ? (
        <div className="resume-box" style={{ marginTop: 'auto' }}>
          <ResumeIcon size={22} color="var(--gold)" />
          <div className="spacer">
            <div style={{ fontSize: 15, fontWeight: 600 }}>Tenés una partida abierta</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Sala {state.lastSession.code}
            </div>
          </div>
          <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => void run(() => client.resumeLast())}>
            VOLVER
          </button>
        </div>
      ) : null}
    </main>
  );
}
