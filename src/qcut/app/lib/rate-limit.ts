type RateLimitResult = {
	success: boolean;
	limit: number;
	remaining: number;
	reset: number;
};

type LocalRateLimiter = {
	limit: (identifier: string) => Promise<RateLimitResult>;
};

function createLocalRateLimit(limit: number): LocalRateLimiter {
	return {
		async limit(_identifier: string) {
			return {
				success: true,
				limit,
				remaining: limit,
				reset: Date.now(),
			};
		},
	};
}

export const waitlistRateLimit = createLocalRateLimit(5);
export const baseRateLimit = createLocalRateLimit(10);
export const transcriptionRateLimit = createLocalRateLimit(3);
