// Shows an error message in a role="alert" element; renders nothing when there is no message.
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="error" role="alert" dir="auto">{message}</p>;
}

/** The text of whatever was thrown, so the server's own message (it names the model's address on a 502) reaches the screen. */
export function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong.';
}
