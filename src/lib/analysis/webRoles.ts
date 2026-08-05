/**
 * Ground-truth spec table for the web slots an image can be recommended for.
 *
 * These numbers are injected verbatim into the model prompt AND drive real
 * canvas crops in `cropForRole`, so every value here has to be a concrete,
 * realistic target rather than a placeholder.
 *
 * Shared by the browser bundle and the Vite-side server code, so this module
 * stays pure TypeScript: no DOM types, no Node built-ins, no side effects.
 */

/** Canonical role ids. `z.enum` in `schema.ts` is derived from this tuple. */
export const webRoleIds = [
  'hero',
  'headerBanner',
  'cardThumbnail',
  'background',
  'avatar',
  'socialShare',
  'inlineContent',
  'galleryTile',
] as const;

export type WebRoleId = (typeof webRoleIds)[number];

/** Output encodings a role can target. Constrained to what a canvas can emit. */
export type RoleOutputFormat = 'webp' | 'avif' | 'jpeg' | 'png';

export type WebRole = {
  /** Stable key. Matches `roleFits[].roleId` in the analysis schema. */
  id: WebRoleId;
  /** Human label for the UI. */
  label: string;
  /** What the slot is for. Also given to the model as the role's definition. */
  description: string;
  /** Target aspect ratio as width / height. Derived from `width` / `height`. */
  aspectRatio: number;
  /** Display form of the ratio, e.g. `12:5`. */
  aspectRatioLabel: string;
  /** Recommended output width in CSS pixels at 1x. */
  width: number;
  /** Recommended output height in CSS pixels at 1x. */
  height: number;
  /** Budget for the encoded file. Anything past this is flagged as too heavy. */
  maxWeightKb: number;
  /** Encoding the crop should ship as, unless alpha or browser support forces a downgrade. */
  preferredFormat: RoleOutputFormat;
};

type WebRoleSpec = Omit<WebRole, 'aspectRatio'>;

/** Ratio is always derived from the pixel target so the two can never disagree. */
const defineRole = (spec: WebRoleSpec): WebRole => ({
  ...spec,
  aspectRatio: spec.width / spec.height,
});

export const webRoles: Record<WebRoleId, WebRole> = {
  hero: defineRole({
    id: 'hero',
    label: 'Hero banner',
    description:
      'Full-bleed image at the top of a landing page, usually with a headline and a call-to-action laid over it. Needs a wide, uncluttered composition and room for text.',
    aspectRatioLabel: '12:5',
    width: 1920,
    height: 800,
    maxWeightKb: 300,
    preferredFormat: 'webp',
  }),
  headerBanner: defineRole({
    id: 'headerBanner',
    label: 'Section header banner',
    description:
      'Short, very wide strip that caps a page section or a profile. The extreme ratio crops away most vertical detail, so the subject has to read in a thin band.',
    aspectRatioLabel: '4:1',
    width: 1600,
    height: 400,
    maxWeightKb: 200,
    preferredFormat: 'webp',
  }),
  cardThumbnail: defineRole({
    id: 'cardThumbnail',
    label: 'Card thumbnail',
    description:
      'Small preview image at the top of a content card in a grid or list. Viewed at roughly 300-400px wide, so fine detail and small text are lost.',
    aspectRatioLabel: '3:2',
    width: 600,
    height: 400,
    maxWeightKb: 80,
    preferredFormat: 'webp',
  }),
  background: defineRole({
    id: 'background',
    label: 'Page background',
    description:
      'Large decorative backdrop sitting behind body content. Must be low-contrast and quiet enough that text stays legible on top of it.',
    aspectRatioLabel: '16:9',
    width: 2560,
    height: 1440,
    maxWeightKb: 400,
    preferredFormat: 'webp',
  }),
  avatar: defineRole({
    id: 'avatar',
    label: 'Avatar',
    description:
      'Square profile image, usually masked to a circle and displayed between 40px and 128px. Needs a single subject centred with margin so a circular mask does not clip it.',
    aspectRatioLabel: '1:1',
    width: 512,
    height: 512,
    maxWeightKb: 60,
    preferredFormat: 'webp',
  }),
  socialShare: defineRole({
    id: 'socialShare',
    label: 'Open Graph / social share',
    description:
      'The og:image shown when a link is unfurled on social platforms. Cropped hard by some clients, so keep the subject central. Many crawlers still do not decode WebP or AVIF.',
    aspectRatioLabel: '1.91:1',
    width: 1200,
    height: 630,
    maxWeightKb: 300,
    preferredFormat: 'jpeg',
  }),
  inlineContent: defineRole({
    id: 'inlineContent',
    label: 'Inline article image',
    description:
      'Image placed inside body copy at the width of the text column. Carries explanatory weight, so detail and legibility matter more than drama.',
    aspectRatioLabel: '16:9',
    width: 1200,
    height: 675,
    maxWeightKb: 150,
    preferredFormat: 'webp',
  }),
  galleryTile: defineRole({
    id: 'galleryTile',
    label: 'Gallery tile',
    description:
      'Square tile in a masonry or grid gallery, usually one of many on screen and often a click target for a lightbox. Should stay readable at thumbnail size.',
    aspectRatioLabel: '1:1',
    width: 800,
    height: 800,
    maxWeightKb: 120,
    preferredFormat: 'webp',
  }),
};

/** The same roles as an ordered array, for iteration in the prompt and the UI. */
export const webRoleList: readonly WebRole[] = webRoleIds.map((id) => webRoles[id]);

export const roleOutputMimeTypes: Record<RoleOutputFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export const getWebRole = (id: WebRoleId): WebRole => webRoles[id];

/**
 * Renders the spec table as plain text for the system prompt, so the model
 * scores against the exact targets the crop generator will use.
 */
export const formatWebRolesForPrompt = (): string =>
  webRoleList
    .map(
      (role) =>
        `- ${role.id} (${role.label}): ${role.aspectRatioLabel} ratio, ${role.width}x${role.height}px, max ${role.maxWeightKb}KB, prefers ${role.preferredFormat}. ${role.description}`,
    )
    .join('\n');
