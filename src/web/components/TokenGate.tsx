// Asks for the access token once; the token is then kept in this browser and sent with every API call.
import { useState } from 'react';
import type { FormEvent } from 'react';

export function TokenGate({ message, onToken }: { message?: string | null; onToken: (token: string) => void }) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const token = value.trim();
    if (token) onToken(token);
  };

  return (
    <main className="gate">
      <form onSubmit={submit}>
        <h1>Thought-line</h1>
        <p>Enter the access token you started the server with. It stays in this browser.</p>
        {message ? <p className="error" role="alert">{message}</p> : null}
        <label htmlFor="token">Access token</label>
        <input id="token" type="password" autoComplete="off" autoFocus value={value} onChange={e => setValue(e.target.value)} />
        <button type="submit" className="primary" disabled={value.trim() === ''}>Open</button>
      </form>
    </main>
  );
}
