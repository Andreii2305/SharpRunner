const DIWATA_LAYER_BASE = `${import.meta.env.BASE_URL}game/assets/characters/npc/diwata-splitbyitem1/items`;

export const DIWATA_FAIRY_CONFIG = {
  key: "diwata_fairy",
  frameWidth: 64,
  frameHeight: 64,
  columns: 13,
  directions: ["up", "left", "down", "right"],
  defaultDirection: "right",
  layers: [
    {
      name: "rearWings",
      type: "spritesheet",
      depth: 5,
      path: `${DIWATA_LAYER_BASE}/005 transparent_pixie_wings__pink_.png`,
      animationFallbacks: {
        idle: { animation: "spellcast", frames: [0, 1, 2, 3, 4, 5, 6] },
      },
    },
    {
      name: "rearHair",
      type: "spritesheet",
      depth: 9,
      path: `${DIWATA_LAYER_BASE}/009 shoulderl__orange_.png`,
    },
    {
      name: "body",
      type: "spritesheet",
      depth: 10,
      path: `${DIWATA_LAYER_BASE}/010 body_color__light_.png`,
    },
    {
      name: "dress",
      type: "spritesheet",
      depth: 30,
      path: `${DIWATA_LAYER_BASE}/030 slit_dress__pink_.png`,
    },
    {
      name: "overskirt",
      type: "spritesheet",
      depth: 35,
      path: `${DIWATA_LAYER_BASE}/035 overskirt__pink_.png`,
    },
    {
      name: "necklace",
      type: "spritesheet",
      depth: 80,
      path: `${DIWATA_LAYER_BASE}/080 simple_necklace__steel_.png`,
    },
    {
      name: "head",
      type: "spritesheet",
      depth: 100,
      path: `${DIWATA_LAYER_BASE}/100 human_elderly_small__light_.png`,
    },
    {
      name: "face",
      type: "spritesheet",
      depth: 101,
      path: `${DIWATA_LAYER_BASE}/101 neutral__light_.png`,
    },
    {
      name: "eyebrows",
      type: "spritesheet",
      depth: 106,
      path: `${DIWATA_LAYER_BASE}/106 thin_eyebrows__orange_.png`,
    },
    {
      name: "earrings",
      type: "spritesheet",
      depth: 115,
      path: `${DIWATA_LAYER_BASE}/115 emerald_earrings__purple_.png`,
    },
    {
      name: "hair",
      type: "spritesheet",
      depth: 120,
      path: `${DIWATA_LAYER_BASE}/120 shoulderl__orange_.png`,
    },
    {
      name: "ears",
      type: "spritesheet",
      depth: 126,
      path: `${DIWATA_LAYER_BASE}/126 elven_ears__light_.png`,
    },
    {
      name: "frontWings",
      type: "spritesheet",
      depth: 140,
      path: `${DIWATA_LAYER_BASE}/140 transparent_pixie_wings__pink_.png`,
      animationFallbacks: {
        idle: { animation: "spellcast", frames: [0, 1, 2, 3, 4, 5, 6] },
      },
    },
    {
      name: "wand",
      type: "spritesheet",
      depth: 141,
      path: `${DIWATA_LAYER_BASE}/140 wand__wand_.png`,
    },
  ],
  animations: {
    idle: {
      row: 22,
      directions: ["up", "left", "down", "right"],
      frames: [0, 0, 1],
      frameRate: 3,
    },
    spellcast: {
      row: 0,
      directions: ["up", "left", "down", "right"],
      frames: [0, 1, 2, 3, 4, 5, 6],
      frameRate: 8,
    },
  },
};
