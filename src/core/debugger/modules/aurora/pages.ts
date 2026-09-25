export const AURORA_PAGES = {
  group: "aurora",
  order: {
    mood: 1,
    effects: 2,
    settings: 3,
    camera: 4,
    texturePreview: 5,
    urp: 6,
    catalog: 7,
  },
} as const;

export type AuroraPage = keyof typeof AURORA_PAGES.order;

export function auroraPage(page: AuroraPage) {
  return { group: AURORA_PAGES.group, order: AURORA_PAGES.order[page], command: false };
}
