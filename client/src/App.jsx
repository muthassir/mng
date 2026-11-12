import { useEffect, useRef, useState } from 'react';
import { auth, loginWithGoogle, signOut, onAuthStateChanged } from './firebase';

const PREFIX = 'whitehouse:v1';

const localKeys = () => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
const clearLocal = () => localKeys().forEach((k) => localStorage.removeItem(k));

async function api(user, method = 'GET', body) {
  const token = await user.getIdToken();
  const res = await fetch('/api/state', {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const pending = useRef({});
  const timer = useRef(null);
  const flushRef = useRef(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setReady(false);
        setUser(u);
      }),
    []
  );

  // After login: load this user's data into localStorage, then open the shop app
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const remote = await api(user);
      const local = Object.fromEntries(localKeys().map((k) => [k, localStorage.getItem(k)]));
      if (!Object.keys(remote).length && Object.keys(local).length) {
        await api(user, 'PUT', { changes: local }); // first login: import data already on this phone
      } else {
        clearLocal();
        Object.entries(remote).forEach(([k, v]) => localStorage.setItem(k, v));
      }
      if (!cancelled) setReady(true);
    })().catch(() => setStatus('Could not reach server'));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The shop app (iframe) writes to localStorage; the 'storage' event tells us what changed
  useEffect(() => {
    if (!user || !ready) return;
    const flush = async () => {
      const changes = pending.current;
      if (!Object.keys(changes).length) return;
      pending.current = {};
      setStatus('Saving…');
      try {
        await api(user, 'PUT', { changes });
        setStatus('Saved');
      } catch {
        pending.current = { ...changes, ...pending.current };
        setStatus('Offline – will retry');
      }
    };
    flushRef.current = flush;
    const onStorage = (e) => {
      if (e.key && e.key.startsWith(PREFIX) && e.newValue !== null) {
        pending.current[e.key] = e.newValue;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, 700);
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onHide);
    const retry = setInterval(flush, 15000);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onHide);
      clearInterval(retry);
    };
  }, [user, ready]);

  const logout = async () => {
    await flushRef.current?.();
    clearLocal();
    await signOut(auth);
  };

  if (user === undefined) return <div className="center">Loading…</div>;

  if (!user)
    return (
      <div className="center">
        <div className="login">
          <h1>Whitehouse</h1>
          <p>Shop management for your store</p>
          <button onClick={() => loginWithGoogle().catch((e) => alert(e.message))}>Continue with Google</button>
        </div>
      </div>
    );

  return (
    <div className="shell">
      <div className="bar">
        <span className="email">{user.email}</span>
        <span className="status">{status}</span>
        <button onClick={logout}>Sign out</button>
      </div>
      {ready ? <iframe title="Whitehouse" src="/legacy.html" /> : <div className="center">{status || 'Loading your shop…'}</div>}
    </div>
  );
}
