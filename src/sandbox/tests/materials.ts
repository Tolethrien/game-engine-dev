import Material from "@/core/aurora2/material";
import { MaterialParams } from "@/core/aurora2/urp/draw";
import laserElectric from "@/core/aurora2/urp/shaders/materials/laserElectric.wgsl?raw";
import laserPulse from "@/core/aurora2/urp/shaders/materials/laserPulse.wgsl?raw";
import laserPlasma from "@/core/aurora2/urp/shaders/materials/laserPlasma.wgsl?raw";
import laserTracer from "@/core/aurora2/urp/shaders/materials/laserTracer.wgsl?raw";
import glowOrb from "@/core/aurora2/urp/shaders/materials/glowOrb.wgsl?raw";
import textRainbow from "@/core/aurora2/urp/shaders/materials/textRainbow.wgsl?raw";
import textGlow from "@/core/aurora2/urp/shaders/materials/textGlow.wgsl?raw";

// params: x = intensity, y = speed, z = effect specific, w = seed
export const LASER_ELECTRIC = Material.create({
  name: "laserElectric",
  blend: "additive",
  fragment: laserElectric,
});
export const LASER_PULSE = Material.create({
  name: "laserPulse",
  blend: "additive",
  fragment: laserPulse,
});
export const LASER_PLASMA = Material.create({
  name: "laserPlasma",
  blend: "additive",
  fragment: laserPlasma,
});
export const LASER_TRACER = Material.create({
  name: "laserTracer",
  blend: "additive",
  fragment: laserTracer,
});
export const GLOW_ORB = Material.create({
  name: "glowOrb",
  blend: "additive",
  fragment: glowOrb,
});
export const TEXT_GLOW = Material.create({
  name: "textGlow",
  fragment: textGlow,
  transparent: true,
});
export const TEXT_RAINBOW = Material.create({
  name: "textRainbow",
  fragment: textRainbow,
});

export const PULSE_PARAMS: MaterialParams = [1.3, 1.5, 90, 0];
export const PLASMA_PARAMS: MaterialParams = [1.0, 1.0, 0, 2.0];
export const ORB_CENTER: MaterialParams = [1.2, 3.0, 0, 0];
export const ORB_SMALL: MaterialParams = [1.0, 5.0, 0, 1.5];
