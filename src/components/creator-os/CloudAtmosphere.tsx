"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";

type CloudAtmosphereProps = {
  onWebglFailure: () => void;
  progressRef: MutableRefObject<number>;
  onInvalidateReady: (invalidate: (() => void) | null) => void;
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// A lightweight fBm cloud field inspired by the original WZRD deck art. It is
// intentionally a 2D atmosphere instead of a costly raymarch: the page needs
// a visual threshold, not a game-engine skybox.
const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uProgress;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.56;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);

    for (int i = 0; i < 5; i++) {
      sum += amp * noise(p);
      p = rot * p * 2.03 + 9.7;
      amp *= 0.52;
    }

    return sum;
  }

  void main() {
    vec2 uv = vUv;
    float journey = clamp(uProgress, 0.0, 1.0);
    vec2 drift = vec2(-journey * 0.46, journey * 0.11);
    float horizon = smoothstep(0.0, 0.72, uv.y);

    vec3 lowerSky = vec3(0.015, 0.045, 0.12);
    vec3 upperSky = vec3(0.08, 0.30, 0.62);
    vec3 sky = mix(lowerSky, upperSky, horizon);

    float fieldA = fbm(uv * vec2(2.1, 3.2) + drift);
    float fieldB = fbm(uv * vec2(4.8, 2.3) - drift * 0.65);
    float cloud = smoothstep(0.42, 0.78, fieldA * 0.72 + fieldB * 0.38 + uv.y * 0.12);
    float mist = smoothstep(0.18, 0.92, fbm(uv * vec2(1.15, 2.1) + drift * 0.4));

    vec3 cloudShadow = vec3(0.21, 0.36, 0.56);
    vec3 cloudLight = vec3(0.86, 0.93, 1.0);
    vec3 cloudColor = mix(cloudShadow, cloudLight, smoothstep(0.42, 1.0, fieldB + uv.y * 0.24));
    sky = mix(sky, cloudColor, cloud * (0.78 - journey * 0.22));
    sky += mist * 0.055 * vec3(0.42, 0.65, 1.0);

    float sun = smoothstep(0.28, 0.0, distance(uv, vec2(0.73, 0.64)));
    sky += sun * vec3(0.3, 0.42, 0.56) * (1.0 - journey * 0.58);

    float veil = smoothstep(0.52, 1.0, journey);
    sky = mix(sky, vec3(0.02, 0.035, 0.07), veil * 0.84);
    sky *= 0.85 + 0.15 * smoothstep(0.0, 0.45, uv.y);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

function CloudPlane({ onWebglFailure, progressRef, onInvalidateReady }: CloudAtmosphereProps) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );

  useEffect(() => {
    onInvalidateReady(invalidate);
    invalidate();

    return () => {
      onInvalidateReady(null);
      material.dispose();
    };
  }, [invalidate, material, onInvalidateReady]);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onWebglFailure();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, { passive: false });

    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onWebglFailure]);

  useFrame(() => {
    const next = progressRef.current;
    if (material.uniforms.uProgress.value !== next) {
      material.uniforms.uProgress.value = next;
    }
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default function CloudAtmosphere({
  onWebglFailure,
  progressRef,
  onInvalidateReady,
}: CloudAtmosphereProps) {
  return (
    <Canvas
      aria-hidden="true"
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      dpr={[1, 1.25]}
      frameloop="demand"
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      orthographic
      role="presentation"
      style={{ height: "100%", width: "100%" }}
    >
      <CloudPlane
        onWebglFailure={onWebglFailure}
        onInvalidateReady={onInvalidateReady}
        progressRef={progressRef}
      />
    </Canvas>
  );
}
