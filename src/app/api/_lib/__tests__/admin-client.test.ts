import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import {
	createSupabaseAdminClient,
	SupabaseAdminConfigurationError,
} from "../admin-client";

const originalUrl = process.env.SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("createSupabaseAdminClient", () => {
	beforeEach(() => {
		mocks.createClient.mockReset();
		mocks.createClient.mockReturnValue({ role: "service" });
		process.env.SUPABASE_URL = "https://project.supabase.co";
		process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
	});

	afterEach(() => {
		if (originalUrl === undefined) delete process.env.SUPABASE_URL;
		else process.env.SUPABASE_URL = originalUrl;
		if (originalServiceKey === undefined) {
			delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		} else {
			process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
		}
	});

	it("uses only the service role with non-persistent server auth", () => {
		expect(createSupabaseAdminClient()).toEqual({ role: "service" });
		expect(mocks.createClient).toHaveBeenCalledWith(
			"https://project.supabase.co",
			"service-role-secret",
			{
				auth: {
					autoRefreshToken: false,
					detectSessionInUrl: false,
					persistSession: false,
				},
			}
		);
	});

	it("fails closed without the exact service role key", () => {
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		process.env.SUPABASE_SERVICE_KEY = "legacy-key-must-not-be-used";
		process.env.SUPABASE_ANON_KEY = "anon-must-not-be-used";

		expect(() => createSupabaseAdminClient()).toThrow(
			SupabaseAdminConfigurationError
		);
		expect(mocks.createClient).not.toHaveBeenCalled();
		delete process.env.SUPABASE_SERVICE_KEY;
		delete process.env.SUPABASE_ANON_KEY;
	});

	it("fails closed without SUPABASE_URL instead of using a public fallback", () => {
		delete process.env.SUPABASE_URL;
		process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public.supabase.co";

		expect(() => createSupabaseAdminClient()).toThrow(
			SupabaseAdminConfigurationError
		);
		expect(mocks.createClient).not.toHaveBeenCalled();
		delete process.env.NEXT_PUBLIC_SUPABASE_URL;
	});
});
