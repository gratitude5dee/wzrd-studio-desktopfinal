import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

function cleanSecret(value: string | undefined): string | undefined {
	if (!value || value === "undefined" || value === "null") return undefined;
	return value.trim() || undefined;
}

export class SupabaseAdminConfigurationError extends Error {
	readonly code = "server_misconfigured";

	constructor(message: string) {
		super(message);
		this.name = "SupabaseAdminConfigurationError";
	}
}

/**
 * Creates a service-role client for server-only API work.
 *
 * This deliberately has no URL, anon-key, or publishable-key fallback. Missing
 * privileged configuration must stop the write path rather than silently
 * downgrading it to a client credential.
 */
export function createSupabaseAdminClient() {
	const url = cleanSecret(process.env.SUPABASE_URL);
	const serviceRoleKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);

	if (!url || !serviceRoleKey) {
		throw new SupabaseAdminConfigurationError(
			"SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server render operations."
		);
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		throw new SupabaseAdminConfigurationError("SUPABASE_URL must be a valid URL.");
	}
	if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
		throw new SupabaseAdminConfigurationError(
			"SUPABASE_URL must use http or https."
		);
	}

	return createClient<Database>(url, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			detectSessionInUrl: false,
			persistSession: false,
		},
	});
}
