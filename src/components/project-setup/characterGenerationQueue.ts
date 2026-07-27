export const CHARACTER_IMAGE_GENERATION_CONCURRENCY = 3;

export async function runCharacterImageGenerationQueue<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<unknown> | unknown,
  concurrency = CHARACTER_IMAGE_GENERATION_CONCURRENCY
) {
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}
