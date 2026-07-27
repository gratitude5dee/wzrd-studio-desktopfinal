import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getWorkflowCreditCost,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
  shouldSkipCreditBilling,
} from '../_shared/credits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-credit-billing',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const encoder = new TextEncoder();

type StreamPhase = 'creating' | 'drafting' | 'enriching' | 'ready';

interface RequestBody {
  projectId?: string;
  sceneId?: string;
  existingShots?: Array<{ id: string; shot_number: number }>;
  shotCount?: number;
  requestId?: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const phaseDelay = (phase: StreamPhase) => {
  switch (phase) {
    case 'creating':
      return 110;
    case 'drafting':
      return 190;
    case 'enriching':
      return 220;
    case 'ready':
      return 160;
    default:
      return 150;
  }
};

const parseTitleFromIdea = (idea: string) => {
  const words = idea.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.length > 0 ? words.join(' ') : 'Cinematic beat';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, title')
      .eq('id', body.projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let targetSceneId = body.sceneId ?? null;
    if (!targetSceneId) {
      const { data: firstScene } = await adminClient
        .from('scenes')
        .select('id')
        .eq('project_id', body.projectId)
        .order('scene_number', { ascending: true })
        .limit(1)
        .single();
      targetSceneId = firstScene?.id ?? null;
    }

    if (!targetSceneId) {
      return new Response(JSON.stringify({ error: 'No scene found for project' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: scene } = await adminClient
      .from('scenes')
      .select('id, scene_number, title, description, location, lighting, weather')
      .eq('id', targetSceneId)
      .single();

    const { data: existingSceneShots } = await adminClient
      .from('shots')
      .select('id, shot_number, prompt_idea, visual_prompt, image_status')
      .eq('scene_id', targetSceneId)
      .order('shot_number', { ascending: true });

    const requestId = typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID();
    const desiredShotCount = Math.max(1, Math.min(body.shotCount ?? 3, 6));
    const estimatedCredits = getWorkflowCreditCost('gen-shots', desiredShotCount / 2);
    const creditReservation = await reserveCredits({
      supabase: anonClient,
      userId: user.id,
      resourceType: 'text',
      requestedAmount: estimatedCredits,
      referenceType: 'gen_shots',
      referenceId: targetSceneId,
      idempotencyKey: buildCreditIdempotencyKey('gen-shots', user.id, targetSceneId, requestId),
      metadata: {
        endpoint: 'gen-shots',
        project_id: body.projectId,
        scene_id: targetSceneId,
        requested_shots: desiredShotCount,
      },
      skipBilling: shouldSkipCreditBilling(req.headers),
    });
    const highestShotNumber = (existingSceneShots || []).reduce(
      (max, shot) => Math.max(max, shot.shot_number ?? 0),
      0
    );

    const sceneContext = [
      scene?.description && `Scene: ${scene.description}`,
      scene?.location && `Location: ${scene.location}`,
      scene?.lighting && `Lighting: ${scene.lighting}`,
      scene?.weather && `Weather: ${scene.weather}`,
    ].filter(Boolean).join('\n');

    let placeholderIdeas: string[];
    try {
      const aiResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You generate distinct cinematic shot descriptions for storyboards. Each shot must describe a DIFFERENT moment, angle, or subject. Do NOT include shot numbers or "Shot #:" prefixes. Return ONLY a JSON object with a "shots" array of strings.',
            },
            {
              role: 'user',
              content: `Generate exactly ${desiredShotCount} distinct shot descriptions for this scene:\n${sceneContext}\n\nVary shot types (wide establishing, medium, close-up detail, reaction, POV, etc). Each description should be 1-2 sentences capturing a specific visual moment. No numbering.`,
            },
          ],
        }),
      });
      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);
      const ideas = Array.isArray(parsed) ? parsed : parsed.shots || parsed.ideas || parsed.descriptions || [];
      if (ideas.length >= desiredShotCount) {
        placeholderIdeas = ideas.slice(0, desiredShotCount);
      } else {
        throw new Error('Insufficient ideas');
      }
    } catch {
      const sceneLabel = scene?.title || scene?.description || `Scene ${scene?.scene_number ?? ''}`;
      const location = scene?.location ? ` at ${scene.location}` : '';
      const angles = [
        'Establishing wide shot of', 'Character-focused moment in',
        'Close-up detail from', 'Action beat in',
        'Atmospheric insert from', 'Reaction shot in',
      ];
      placeholderIdeas = Array.from({ length: desiredShotCount }).map((_, i) =>
        `${angles[i % angles.length]} ${sceneLabel}${location}`
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        };
        let insertedShots = 0;
        try {
          send('meta', {
            requestId,
            projectId: body.projectId,
            sceneId: targetSceneId,
            latency: 0,
          });

          const shotsToStream: Array<{
            id: string;
            shot_number: number;
            prompt_idea: string;
            visual_prompt: string;
          }> = [];

          for (let index = 0; index < placeholderIdeas.length; index += 1) {
            const shotNumber = highestShotNumber + index + 1;
            const promptIdea = placeholderIdeas[index];
            const visualPrompt = `${promptIdea}. ${scene?.lighting || 'Cinematic lighting'}, professional framing, filmic detail.`;

            const { data: insertedShot, error: insertError } = await adminClient
              .from('shots')
              .insert({
                project_id: body.projectId,
                scene_id: targetSceneId,
                shot_number: shotNumber,
                shot_type: index === 0 ? 'wide' : index === 1 ? 'medium' : 'close_up',
                prompt_idea: promptIdea,
                visual_prompt: null,
                image_status: 'pending',
                image_generation_error: null,
                video_status: 'pending',
                video_generation_error: null,
                audio_status: 'pending',
              })
              .select('id, shot_number')
              .single();

            if (insertError || !insertedShot) {
              console.error('Failed to insert shot shell:', insertError);
              continue;
            }
            insertedShots += 1;

            shotsToStream.push({
              id: insertedShot.id,
              shot_number: insertedShot.shot_number,
              prompt_idea: promptIdea,
              visual_prompt: visualPrompt,
            });
          }

          const phases: StreamPhase[] = ['creating', 'drafting', 'enriching', 'ready'];

          await Promise.all(
            shotsToStream.map(async (shot, shotIndex) => {
              for (const phase of phases) {
                await wait(phaseDelay(phase) + shotIndex * 65);

                if (phase === 'drafting') {
                  await adminClient
                    .from('shots')
                    .update({
                      prompt_idea: shot.prompt_idea,
                      shot_type:
                        shotIndex % 3 === 0
                          ? 'wide'
                          : shotIndex % 3 === 1
                            ? 'medium'
                            : 'close_up',
                    })
                    .eq('id', shot.id);
                }

                if (phase === 'enriching') {
                  await adminClient
                    .from('shots')
                    .update({
                      visual_prompt: shot.visual_prompt,
                      image_status: 'prompt_ready',
                      image_generation_error: null,
                      failure_reason: null,
                    })
                    .eq('id', shot.id);
                }

                send('shot', {
                  id: shot.id,
                  scene_id: targetSceneId,
                  project_id: body.projectId,
                  shot_number: shot.shot_number,
                  status: phase,
                  title: parseTitleFromIdea(shot.prompt_idea),
                  description: shot.prompt_idea,
                  visual_prompt: phase === 'creating' ? null : shot.visual_prompt,
                  thumbnail: null,
                });
              }
            })
          );

          const actualCredits = insertedShots > 0
            ? getWorkflowCreditCost('gen-shots', insertedShots / 2)
            : 0;

          if (!creditReservation.skipped && creditReservation.holdId) {
            if (actualCredits > 0) {
              await commitCredits({
                supabase: anonClient,
                holdId: creditReservation.holdId,
                skipped: creditReservation.skipped,
                amount: actualCredits,
                metadata: {
                  endpoint: 'gen-shots',
                  scene_id: targetSceneId,
                  project_id: body.projectId,
                  inserted_shots: insertedShots,
                },
              });
            } else {
              await releaseCredits({
                supabase: anonClient,
                holdId: creditReservation.holdId,
                skipped: creditReservation.skipped,
                reason: 'no_shots_inserted',
                metadata: {
                  endpoint: 'gen-shots',
                  scene_id: targetSceneId,
                  project_id: body.projectId,
                },
              });
            }
          }

          send('done', { completed: true, total: shotsToStream.length, requestId });
        } catch (streamError) {
          const message = streamError instanceof Error ? streamError.message : 'Streaming failed';
          console.error('gen-shots streaming error:', streamError);
          const partialCredits = insertedShots > 0
            ? getWorkflowCreditCost('gen-shots', insertedShots / 2)
            : 0;

          if (!creditReservation.skipped && creditReservation.holdId) {
            if (partialCredits > 0) {
              await commitCredits({
                supabase: anonClient,
                holdId: creditReservation.holdId,
                skipped: creditReservation.skipped,
                amount: partialCredits,
                metadata: {
                  endpoint: 'gen-shots',
                  scene_id: targetSceneId,
                  project_id: body.projectId,
                  inserted_shots: insertedShots,
                  partial: true,
                },
              });
            } else {
              await releaseCredits({
                supabase: anonClient,
                holdId: creditReservation.holdId,
                skipped: creditReservation.skipped,
                reason: 'stream_error',
                metadata: {
                  endpoint: 'gen-shots',
                  scene_id: targetSceneId,
                  project_id: body.projectId,
                  error: message,
                },
              });
            }
          }
          send('error', { error: message, requestId });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    console.error('gen-shots unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
