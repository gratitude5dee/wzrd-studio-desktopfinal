import { useCallback, useMemo, useState } from 'react';

import { MiniShell } from '../MiniShell';
import { getDeviceId, publishArtifact } from '../lib/mini-api';
import { downloadBlob, shareArtifact } from '../lib/share';
import { defaultControlValues, type ControlGroup, type ControlValues } from './app-schema';
import { CanvasStage } from './components/CanvasStage';
import { Composer } from './components/Composer';
import { ControlSheet } from './components/ControlSheet';
import { HistoryFormatBar } from './components/HistoryFormatBar';
import { IntentRail } from './components/IntentRail';
import { MiniHeader } from './components/MiniHeader';
import { SendButton } from './components/SendButton';
import { ASPECT_PRESETS, centeredCropForRatio, type CropRect } from './lib/canvas-ops';
import { useImageEditor } from './state/useImageEditor';

function ratioForPreset(id: unknown): number | null {
  return ASPECT_PRESETS.find((preset) => preset.id === id)?.ratio ?? null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

/** Single-column Image Editor (§3.1). */
export function ImageEditorPage() {
  const editor = useImageEditor();
  const [values, setValues] = useState<ControlValues>(defaultControlValues);
  const [group, setGroup] = useState<ControlGroup>('reframe');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const { snapshot } = editor;
  const straighten = Number(values['reframe.straighten'] ?? 0);
  const aspectRatio = ratioForPreset(values['reframe.aspect']);

  /** The overlay lives in frame space, which already carries the image aspect. */
  const frameRatio = useMemo(() => {
    if (aspectRatio === null || !snapshot) return null;
    return aspectRatio / (snapshot.width / snapshot.height);
  }, [aspectRatio, snapshot]);

  const setValue = useCallback(
    (controlId: string, value: string | number | boolean) => {
      setValues((current) => ({ ...current, [controlId]: value }));
      if (controlId === 'reframe.aspect' && snapshot) {
        const ratio = ratioForPreset(value);
        setCropRect(
          ratio === null ? null : centeredCropForRatio(snapshot.width, snapshot.height, ratio)
        );
      }
    },
    [snapshot]
  );

  const onAction = useCallback(
    (controlId: string) => {
      switch (controlId) {
        case 'reframe.rotate':
          void editor.applyRotate(1);
          break;
        case 'reframe.flip-horizontal':
          void editor.applyFlip('horizontal');
          break;
        case 'reframe.flip-vertical':
          void editor.applyFlip('vertical');
          break;
        default:
          break;
      }
      setCropRect(null);
    },
    [editor]
  );

  const applyCrop = useCallback(async () => {
    if (!cropRect) return;
    await editor.applyCrop(cropRect);
    setCropRect(null);
    setValues((current) => ({ ...current, 'reframe.aspect': 'free' }));
  }, [cropRect, editor]);

  const applyStraighten = useCallback(async () => {
    if (!straighten) return;
    await editor.applyStraighten(straighten);
    setValues((current) => ({ ...current, 'reframe.straighten': 0 }));
  }, [editor, straighten]);

  const send = useCallback(async () => {
    if (!snapshot) return;
    setSending(true);
    setStatus(null);
    try {
      let permalink: string | null = null;
      try {
        const { id } = await publishArtifact({
          dataUrl: await blobToDataUrl(snapshot.blob),
          width: snapshot.width,
          height: snapshot.height,
          deviceId: getDeviceId(),
        });
        permalink = `${window.location.origin}/a/${id}`;
      } catch {
        // Publishing is best-effort; the user still gets their image.
        permalink = null;
      }

      if (!permalink) {
        downloadBlob(snapshot.blob, 'wzrd.png');
        setStatus('Saved to your device');
        return;
      }

      const outcome = await shareArtifact({ permalink, blob: snapshot.blob });
      setStatus(
        outcome === 'copied'
          ? 'Link copied'
          : outcome === 'downloaded'
            ? 'Saved to your device'
            : null
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('Could not send that image');
    } finally {
      setSending(false);
    }
  }, [snapshot]);

  const pendingReframe = Boolean(cropRect) || straighten !== 0;

  return (
    <MiniShell>
      <MiniHeader
        title="Image"
        action={
          snapshot ? (
            <button
              type="button"
              onClick={editor.reset}
              className="text-[13px] text-wzrd-chrome hover:text-wzrd-mist"
            >
              New
            </button>
          ) : null
        }
      />

      <CanvasStage
        snapshot={snapshot}
        cropRect={cropRect}
        onCropRectChange={setCropRect}
        cropRatio={frameRatio}
        straightenDegrees={straighten}
        onPickFile={(file) => void editor.importFile(file)}
        busy={editor.busy}
      />

      <HistoryFormatBar
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onUndo={editor.undo}
        onRedo={editor.redo}
        format={snapshot ? `${snapshot.width}×${snapshot.height}` : null}
      />

      {pendingReframe && (
        <div className="flex shrink-0 items-center justify-end gap-2 px-4 py-2">
          <button
            type="button"
            onClick={() => {
              setCropRect(null);
              setValues((current) => ({
                ...current,
                'reframe.aspect': 'free',
                'reframe.straighten': 0,
              }));
            }}
            className="h-9 rounded-full px-3 text-[13px] text-wzrd-chrome"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void (cropRect ? applyCrop() : applyStraighten());
            }}
            className="h-9 rounded-full bg-wzrd-deep px-4 text-[13px] text-wzrd-mist"
          >
            Apply
          </button>
        </div>
      )}

      <IntentRail
        activeGroup={group}
        onGroupChange={setGroup}
        onOpenSheet={() => setSheetOpen(true)}
        values={values}
        onValueChange={setValue}
        onAction={onAction}
      />

      <Composer hasImage={Boolean(snapshot)} onAttach={(file) => void editor.importFile(file)} />

      {(status || editor.error) && (
        <p className="px-4 text-[13px] text-wzrd-muted-text" role="status">
          {editor.error ?? status}
        </p>
      )}

      <SendButton enabled={Boolean(snapshot)} pending={sending} onSend={() => void send()} />

      <ControlSheet
        open={sheetOpen}
        activeGroup={group}
        onGroupChange={setGroup}
        onClose={() => setSheetOpen(false)}
        values={values}
        onValueChange={setValue}
        onAction={onAction}
      />
    </MiniShell>
  );
}

export default ImageEditorPage;
