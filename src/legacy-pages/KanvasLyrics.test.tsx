import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import KanvasLyrics from './KanvasLyrics';

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

const renderPage = (path = '/kanvas/lyrics/new') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <KanvasLyrics />
    </MemoryRouter>
  );

describe('KanvasLyrics', () => {
  it('renders templates home on /kanvas/lyrics', () => {
    renderPage('/kanvas/lyrics');

    expect(screen.getByRole('heading', { name: 'YOUR TEMPLATES' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new template/i })).toBeInTheDocument();
    expect(screen.getByText(/15\/30\/45\/60s clip/i)).toBeInTheDocument();
  });

  it('renders create workspace on /kanvas/lyrics/new', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'CREATE TEMPLATE' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cut Markers' })).toBeInTheDocument();
  });

  it('save template button is disabled before step 3', () => {
    renderPage();
    const save = screen.getByRole('button', { name: /save template/i });
    expect(save).toBeDisabled();
  });

  it('keeps the 15/30/45/60 duration policy visible in create mode', () => {
    renderPage();

    expect(screen.getByText(/select a 15\/30\/45\/60s clip/i)).toBeInTheDocument();
  });
});
