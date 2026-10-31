// @vitest-environment jsdom
// Tests for the piece editor: a failed analysis shows the model's address and keeps the text, and the happy path saves then analyses.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import type { Piece } from '../../src/core';
import { ApiError, api } from '../../src/web/api';
import { PieceEditor } from '../../src/web/components/PieceEditor';

const piece: Piece = {
  id: 'p1',
  title: 'A short piece',
  privacy: 'private',
  text: 'The first draft.',
  createdAt: '2026-10-31T00:00:00.000Z',
  updatedAt: '2026-10-31T00:00:00.000Z',
};

afterEach(() => { vi.restoreAllMocks(); });

test('a failed analysis shows the error and keeps the text', async () => {
  vi.spyOn(api, 'updateText').mockImplementation(async (_id, text) => ({ ...piece, text }));
  vi.spyOn(api, 'analyze').mockRejectedValue(new ApiError('Model at http://127.0.0.1:1234/v1 unreachable', 502));
  render(<PieceEditor piece={piece} onSaved={() => {}} onAnalyzed={() => {}} />);

  const box = screen.getByRole('textbox', { name: /text/i }) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: 'A new second draft.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('127.0.0.1:1234');
  expect(box.value).toBe('A new second draft.');
  // The button is usable again so he can retry.
  await waitFor(() => expect((screen.getByRole('button', { name: 'Save and analyse' }) as HTMLButtonElement).disabled).toBe(false));
});

test('save and analyse saves the text first, then analyses, then reports back', async () => {
  const order: string[] = [];
  vi.spyOn(api, 'updateText').mockImplementation(async (_id, text) => { order.push('save'); return { ...piece, text }; });
  vi.spyOn(api, 'analyze').mockImplementation(async () => { order.push('analyze'); return {} as never; });
  const onSaved = vi.fn();
  const onAnalyzed = vi.fn();
  render(<PieceEditor piece={piece} onSaved={onSaved} onAnalyzed={onAnalyzed} />);

  fireEvent.change(screen.getByRole('textbox', { name: /text/i }), { target: { value: 'Edited.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));

  await waitFor(() => expect(onAnalyzed).toHaveBeenCalledTimes(1));
  expect(order).toEqual(['save', 'analyze']);
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ text: 'Edited.' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('the text box reads right to left for Arabic and the privacy toggle shows the state', () => {
  render(<PieceEditor piece={{ ...piece, text: 'نص عربي', title: 'عنوان' }} onSaved={() => {}} onAnalyzed={() => {}} />);
  expect(screen.getByRole('textbox', { name: /text/i }).getAttribute('dir')).toBe('auto');
  expect(screen.getByRole('button', { name: 'Private' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Public' }).getAttribute('aria-pressed')).toBe('false');
});

test('going public asks first; staying private on cancel, no question going back to private', async () => {
  const setPrivacy = vi.spyOn(api, 'setPrivacy').mockImplementation(async (_id, privacy) => ({ ...piece, privacy }));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const onSaved = vi.fn();
  const { rerender } = render(<PieceEditor piece={piece} onSaved={onSaved} onAnalyzed={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Public' }));
  expect(confirm).toHaveBeenCalledWith('Make this piece public? It may then be sent to a cloud model if one is configured.');
  expect(setPrivacy).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Public' }));
  await waitFor(() => expect(setPrivacy).toHaveBeenCalledWith('p1', 'public'));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());

  confirm.mockClear();
  rerender(<PieceEditor piece={{ ...piece, privacy: 'public' }} onSaved={onSaved} onAnalyzed={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Private' }));
  await waitFor(() => expect(setPrivacy).toHaveBeenLastCalledWith('p1', 'private'));
  expect(confirm).not.toHaveBeenCalled();
});

test('the text box is read-only while saving and analysing', async () => {
  let release!: () => void;
  vi.spyOn(api, 'analyze').mockImplementation(() => new Promise(res => { release = () => res({} as never); }));
  render(<PieceEditor piece={piece} onSaved={() => {}} onAnalyzed={() => {}} />);
  const box = screen.getByRole('textbox', { name: /text/i }) as HTMLTextAreaElement;
  expect(box.readOnly).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));
  await waitFor(() => expect(box.readOnly).toBe(true));
  release();
  await waitFor(() => expect(box.readOnly).toBe(false));
});

describe('Add note', () => {
  const saved = 'The sun gives. So we fly. The sun gives again.';
  const savedPiece: Piece = { ...piece, text: saved };
  const box = () => screen.getByRole('textbox', { name: /^text$/i }) as HTMLTextAreaElement;
  const select = (start: number, end: number) => {
    box().focus();
    box().setSelectionRange(start, end);
    fireEvent.mouseUp(box());
  };
  const renderEditor = (over: Partial<Parameters<typeof PieceEditor>[0]> = {}) =>
    render(<PieceEditor piece={savedPiece} noteText={saved} onNoteAdded={() => {}} onSaved={() => {}} onAnalyzed={() => {}} {...over} />);

  test('nothing is offered until text is selected', () => {
    renderEditor();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    select(4, 4);
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    select(0, 3);
    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy();
  });

  test('posts the quote with up to 32 characters of context, then reports back and clears the form', async () => {
    const add = vi.spyOn(api, 'addNote').mockResolvedValue({} as never);
    const onNoteAdded = vi.fn();
    renderEditor({ onNoteAdded });
    // The second "The sun gives": the context is what tells it from the first.
    const start = saved.lastIndexOf('The sun gives');
    select(start, start + 'The sun gives'.length);
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: '  Echoes the opening.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(onNoteAdded).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith('p1', {
      body: 'Echoes the opening.',
      quote: 'The sun gives',
      prefix: saved.slice(Math.max(0, start - 32), start),
      suffix: ' again.',
    });
    expect(add.mock.calls[0][1].prefix!.length).toBeLessThanOrEqual(32);
    expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull();
  });

  test('a note needs a body: an empty one is refused with an alert and nothing is posted', () => {
    const add = vi.spyOn(api, 'addNote').mockResolvedValue({} as never);
    renderEditor();
    select(0, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('alert').textContent).toContain('needs some text');
    expect(add).not.toHaveBeenCalled();
  });

  test('an API error is shown in an alert and the note text is kept', async () => {
    vi.spyOn(api, 'addNote').mockRejectedValue(new ApiError('That quote is not in the piece', 404));
    const onNoteAdded = vi.fn();
    renderEditor({ onNoteAdded });
    select(0, 3);
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect((await screen.findByRole('alert')).textContent).toContain('That quote is not in the piece');
    expect((screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement).value).toBe('Keep me');
    expect(onNoteAdded).not.toHaveBeenCalled();
  });

  test('when the editor shows a draft, it explains that notes attach to saved text instead of offering the form', () => {
    renderEditor({ draft: `${saved} And more.` });
    select(0, 3);
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Notes attach to saved text');
  });

  test('when the saved text is not the text that was analysed, the same explanation appears', () => {
    renderEditor({ noteText: 'An earlier analysed text.' });
    select(0, 3);
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Notes attach to saved text');
  });

  test('a selection of only spaces offers nothing', () => {
    renderEditor();
    select(14, 15);
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
  });
});
