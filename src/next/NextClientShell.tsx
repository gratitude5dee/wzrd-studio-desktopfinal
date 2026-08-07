"use client";

import dynamic from "next/dynamic";

import PerfShell from "@/components/perf/PerfShell";

declare global {
	interface Window {
		__WZRD_NEXT_APP_ROUTER?: true;
	}
}

if (typeof window !== "undefined") {
	window.__WZRD_NEXT_APP_ROUTER = true;
}

const ViteApp = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => <PerfShell headline="Preparing studio" />,
});

export function NextClientShell() {
  return <ViteApp />;
}
