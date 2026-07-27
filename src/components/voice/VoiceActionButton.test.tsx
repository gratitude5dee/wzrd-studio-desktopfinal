import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceActionButton } from './VoiceActionButton';

const noop = vi.fn();

describe('VoiceActionButton', () => {
  it('starts and stops push-to-talk on pointer press and release', () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();

    render(
      <VoiceActionButton
        status="idle"
        onPressStart={onPressStart}
        onPressEnd={onPressEnd}
        onDisconnect={noop}
      />,
    );

    const button = screen.getByRole('button', { name: /hold to speak/i });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);

    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard push-to-talk and exposes the status label', () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();

    render(
      <VoiceActionButton
        status="listening"
        onPressStart={onPressStart}
        onPressEnd={onPressEnd}
        onDisconnect={noop}
      />,
    );

    const button = screen.getByRole('button', { name: /hold to speak|tap to disconnect/i });
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyUp(button, { key: ' ' });

    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Listening')).toBeInTheDocument();
  });

  it('shows errors without disabling the rest of the app surface', () => {
    render(
      <VoiceActionButton
        status="error"
        errorMessage="Microphone permission denied"
        onPressStart={vi.fn()}
        onPressEnd={vi.fn()}
        onDisconnect={noop}
      />,
    );

    expect(screen.getByText('Microphone permission denied')).toBeInTheDocument();
  });

  it('shows pending confirmations with explicit confirm and cancel controls', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <VoiceActionButton
        status="confirming"
        pendingConfirmation={{
          actionName: 'kanvas_generate',
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
          input: { studio: 'image' },
          traceId: 'voice_kanvas_generate_test',
        }}
        lastTranscript="Generate the neon scene"
        onPressStart={vi.fn()}
        onPressEnd={vi.fn()}
        onDisconnect={noop}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId('voice-command-dock')).toBeInTheDocument();
    expect(screen.getByText('Confirmation Required')).toBeInTheDocument();
    expect(screen.getByText('This will spend credits. Should I continue?')).toBeInTheDocument();
    expect(screen.getByText(/Generate the neon scene/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('anchors the control bottom-right and opens status to the left', () => {
    render(
      <VoiceActionButton
        status="thinking"
        onPressStart={vi.fn()}
        onPressEnd={vi.fn()}
        onDisconnect={noop}
      />,
    );

    const container = screen.getByTestId('voice-action-button-container');
    expect(container).toHaveClass('right-4');
    expect(container).not.toHaveClass('left-4');
    expect(container).toHaveClass('flex-row-reverse');
    expect(container).toHaveClass('bottom-20');
    expect(container).toHaveClass('md:bottom-12');
  });
});
