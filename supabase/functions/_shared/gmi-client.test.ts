import { isInactiveModelError } from './gmi-client.ts';

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('isInactiveModelError detects GMI inactive-model provider errors', () => {
  assertEquals(
    isInactiveModelError('model ltx-2-fast-image-to-video is currently inactive and not accepting requests'),
    true,
    'should detect the canonical inactive-model message',
  );
  assertEquals(
    isInactiveModelError('Model foo is not accepting requests'),
    true,
    'should detect not-accepting-requests messages',
  );
  assertEquals(
    isInactiveModelError('model bar is unavailable'),
    true,
    'should detect unavailable-model messages',
  );
});

Deno.test('isInactiveModelError ignores unrelated errors', () => {
  assertEquals(isInactiveModelError(undefined), false, 'undefined is not an inactive-model error');
  assertEquals(isInactiveModelError(null), false, 'null is not an inactive-model error');
  assertEquals(isInactiveModelError(''), false, 'empty string is not an inactive-model error');
  assertEquals(
    isInactiveModelError('invalid payload parameters: duration'),
    false,
    'payload validation errors are not inactive-model errors',
  );
  assertEquals(
    isInactiveModelError('GMI queue request failed (500): internal error'),
    false,
    'generic failures are not inactive-model errors',
  );
});
