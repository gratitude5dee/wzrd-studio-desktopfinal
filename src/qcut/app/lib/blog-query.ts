import type {
	MarbleAuthorList,
	MarbleCategoryList,
	MarblePost,
	MarblePostList,
	MarbleTagList,
} from "@qcut-app/types/post";
import { readPublicEnv } from "@/lib/env";

const url =
	readPublicEnv("MARBLE_API_URL", ["VITE_MARBLE_API_URL"]) ?? "https://api.marblecms.com";
const key = readPublicEnv("MARBLE_WORKSPACE_KEY", ["VITE_MARBLE_WORKSPACE_KEY"]);

if (!key) {
	console.warn(
		"[Blog] VITE_MARBLE_WORKSPACE_KEY is not set. Blog features will be unavailable."
	);
}

async function fetchFromMarble<T>(endpoint: string): Promise<T> {
	if (!key) {
		throw new Error(
			"VITE_MARBLE_WORKSPACE_KEY is not set. Cannot fetch blog content."
		);
	}
	try {
		const response = await fetch(`${url}/${key}/${endpoint}`);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`
			);
		}
		return (await response.json()) as T;
	} catch (error) {
		console.error(`Error fetching ${endpoint}:`, error);
		throw error;
	}
}

export async function getPosts() {
	return fetchFromMarble<MarblePostList>("posts");
}

export async function getTags() {
	return fetchFromMarble<MarbleTagList>("tags");
}

export async function getSinglePost(slug: string) {
	return fetchFromMarble<MarblePost>(`posts/${slug}`);
}

export async function getCategories() {
	return fetchFromMarble<MarbleCategoryList>("categories");
}

export async function getAuthors() {
	return fetchFromMarble<MarbleAuthorList>("authors");
}

export async function processHtmlContent(html: string): Promise<string> {
	return html;
}
