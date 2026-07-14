import { describe, expect, it } from "vitest";

import { assertHealthyRootResponse } from "./web-smoke-build.mjs";

const healthyHtml = `<!doctype html>
<html lang="en">
	<body>
		<div id="app">WZRD Studio</div>
		<script src="/_next/static/chunks/app.js"></script>
	</body>
</html>`;

function htmlResponse(body = healthyHtml, init = {}) {
	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/html; charset=utf-8" },
		...init,
	});
}

describe("assertHealthyRootResponse", () => {
	it("accepts a 200 response with a Next.js client bootstrap", () => {
		const response = htmlResponse();

		expect(() => assertHealthyRootResponse(response, healthyHtml)).not.toThrow();
	});

	it("rejects a non-200 response", () => {
		const response = htmlResponse("Internal Server Error", { status: 500 });

		expect(() => assertHealthyRootResponse(response, "Internal Server Error"))
			.toThrow("GET / returned HTTP 500.");
	});

	it("rejects HTML without the Next.js client bootstrap", () => {
		const html = "<!doctype html><html><body>Static shell</body></html>";
		const response = htmlResponse(html);

		expect(() => assertHealthyRootResponse(response, html))
			.toThrow("GET / did not include the Next.js client bootstrap.");
	});

	it("rejects a 200 Next.js error shell", () => {
		const html = healthyHtml.replace(
			"<div id=\"app\">WZRD Studio</div>",
			"<div data-nextjs-error-page>Build failed</div>"
		);
		const response = htmlResponse(html);

		expect(() => assertHealthyRootResponse(response, html))
			.toThrow("GET / returned a Next.js error shell.");
	});
});
