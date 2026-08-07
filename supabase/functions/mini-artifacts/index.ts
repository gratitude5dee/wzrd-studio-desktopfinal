import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { handleCors, errorResponse, successResponse } from '../_shared/response.ts';

/**
 * Public artifact endpoint for the Image Editor mini-app.
 *
 * Zero-auth by design: the mini-app must complete a create-and-share flow with
 * no sign-in. Artifacts are unlisted — knowing the id is what grants access —
 * and live in the private `artifacts` bucket, reached only through short-lived
 * signed URLs minted here.
 */

const BUCKET = 'artifacts';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface PublishBody {
  dataUrl?: string;
  width?: number;
  height?: number;
  deviceId?: string;
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('Expected a base64 data URL');
  const [, mimeType, base64] = match;
  if (!ALLOWED_MIME.has(mimeType)) throw new Error(`Unsupported image type: ${mimeType}`);

  const binary = atob(base64);
  if (binary.length > MAX_BYTES) throw new Error('Image is too large');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const supabase = serviceClient();

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return errorResponse('Missing artifact id', 400);

      const { data: artifact, error } = await supabase
        .from('mini_artifacts')
        .select('id, storage_path, mime_type, width, height, created_at, visibility')
        .eq('id', id)
        .maybeSingle();

      if (error) return errorResponse(error.message, 500);
      if (!artifact || artifact.visibility !== 'unlisted') {
        return errorResponse('Artifact not found', 404);
      }

      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(artifact.storage_path, SIGNED_URL_TTL_SECONDS);

      if (signError || !signed) return errorResponse('Could not sign artifact URL', 500);

      return successResponse({
        id: artifact.id,
        width: artifact.width,
        height: artifact.height,
        mimeType: artifact.mime_type,
        createdAt: artifact.created_at,
        url: signed.signedUrl,
      });
    }

    if (req.method === 'POST') {
      const body = (await req.json()) as PublishBody;
      if (!body.dataUrl) return errorResponse('Missing image data', 400);
      if (!body.width || !body.height) return errorResponse('Missing image dimensions', 400);

      const { bytes, mimeType } = decodeDataUrl(body.dataUrl);
      const id = crypto.randomUUID();
      const extension = mimeType.split('/')[1];
      const storagePath = `${id}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

      if (uploadError) return errorResponse(uploadError.message, 500);

      const { error: insertError } = await supabase.from('mini_artifacts').insert({
        id,
        device_id: body.deviceId ?? null,
        storage_path: storagePath,
        mime_type: mimeType,
        width: Math.round(body.width),
        height: Math.round(body.height),
        byte_size: bytes.byteLength,
        source: 'local',
      });

      if (insertError) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return errorResponse(insertError.message, 500);
      }

      return successResponse({ id }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    console.error('mini-artifacts error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unexpected error', 400);
  }
});
