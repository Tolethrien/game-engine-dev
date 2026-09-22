import Material from "@aurora/material";
import laserElectric from "@aurora/urpOld/shaders/materials/laserElectric.wgsl?raw";
import laserPulse from "@aurora/urpOld/shaders/materials/laserPulse.wgsl?raw";
import laserPlasma from "@aurora/urpOld/shaders/materials/laserPlasma.wgsl?raw";
import laserTracer from "@aurora/urpOld/shaders/materials/laserTracer.wgsl?raw";
import glowOrb from "@aurora/urpOld/shaders/materials/glowOrb.wgsl?raw";
import textRainbow from "@aurora/urpOld/shaders/materials/textRainbow.wgsl?raw";
import textGlow from "@aurora/urpOld/shaders/materials/textGlow.wgsl?raw";

export const LASER_ELECTRIC = Material.create({
  name: "laserElectric",
  blend: "additive",
  fragment: laserElectric,
  params: { intensity: 1, speed: 1, seed: 0 },
});
export const LASER_PULSE = Material.create({
  name: "laserPulse",
  blend: "additive",
  fragment: laserPulse,
  params: { intensity: 1, speed: 1, spacing: 90 },
});
export const LASER_PLASMA = Material.create({
  name: "laserPlasma",
  blend: "additive",
  fragment: laserPlasma,
  params: { intensity: 1, speed: 1, seed: 0 },
});
export const LASER_TRACER = Material.create({
  name: "laserTracer",
  blend: "additive",
  fragment: laserTracer,
  params: { intensity: 1, speed: 1, dashLength: 100 },
});
export const GLOW_ORB = Material.create({
  name: "glowOrb",
  blend: "additive",
  fragment: glowOrb,
  params: { intensity: 1, pulseSpeed: 3, seed: 0 },
});
export const TEXT_GLOW = Material.create({
  name: "textGlow",
  fragment: textGlow,
  transparent: true,
  params: { reach: 7, haloStrength: 0.5, whiten: 0.6 },
});
export const TEXT_RAINBOW = Material.create({
  name: "textRainbow",
  fragment: textRainbow,
  params: { speed: 0.4, bands: 1 },
});

export const PULSE_PARAMS = LASER_PULSE.pack({ intensity: 1.3, speed: 1.5 });
export const PLASMA_PARAMS = LASER_PLASMA.pack({ seed: 2 });
export const ORB_CENTER = GLOW_ORB.pack({ intensity: 1.2 });
export const ORB_SMALL = GLOW_ORB.pack({ pulseSpeed: 5, seed: 1.5 });
