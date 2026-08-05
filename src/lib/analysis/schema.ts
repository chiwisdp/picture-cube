/**
 * The `ImageAnalysis` contract returned by the vision model.
 *
 * Consumed on the server (converted to JSON Schema for OpenRouter structured
 * outputs, then `safeParse`d) and on the client for types, so this module stays
 * pure TypeScript: no DOM types, no Node built-ins, no side effects, and `zod`
 * as the only import.
 *
 * Structured output works best when every object is closed, so nothing here is
 * `.optional()`. Where a value may legitimately be absent the field is nullable
 * or carries a defined "none" member instead. The `.describe()` text on each
 * field is what actually steers the model, so it is written as instructions
 * rather than as documentation.
 */

import { z } from 'zod';
// Extension-ful on purpose: `vite.config.ts` reaches this module through the
// dev API plugin, and Vite's native config loader cannot resolve an
// extensionless relative import. Every module in that chain spells it out.
import { webRoleIds } from './webRoles.ts';

/** Constrained to the ids in `webRoles.ts` so the two can never drift. */
export const webRoleIdSchema = z.enum(webRoleIds);

export const contentTypeSchema = z
  .enum([
    'photograph',
    'illustration',
    'vectorGraphic',
    'logo',
    'icon',
    'screenshot',
    'diagram',
    'chart',
    'texture',
    'render3d',
    'textGraphic',
    'other',
  ])
  .describe('The kind of image this is. Pick the single closest match.');

export const focalPointSchema = z
  .object({
    x: z
      .number()
      .min(0)
      .max(1)
      .describe(
        'Horizontal position of the visual centre of interest, normalised so 0 is the left edge and 1 is the right edge. This drives real crop rectangles, so be precise rather than defaulting to 0.5.',
      ),
    y: z
      .number()
      .min(0)
      .max(1)
      .describe(
        'Vertical position of the visual centre of interest, normalised so 0 is the top edge and 1 is the bottom edge. For a portrait this is the face, not the middle of the body.',
      ),
    description: z
      .string()
      .describe('What sits at that point, in a few words, e.g. "the cyclist\'s face".'),
  })
  .describe(
    'The point every crop should be centred on. Cropping to other aspect ratios keeps this point in frame.',
  );

export const overlayTextSafeZoneSchema = z
  .object({
    region: z
      .enum([
        'top',
        'bottom',
        'left',
        'right',
        'center',
        'topLeft',
        'topRight',
        'bottomLeft',
        'bottomRight',
        'none',
      ])
      .describe(
        'The area of the image where headline or button text can sit without covering the subject or landing on busy detail. Use "none" if the image is too busy everywhere for legible overlay text.',
      ),
    recommendedTextColor: z
      .enum(['light', 'dark', 'either'])
      .describe('Text colour that would hold contrast against that region.'),
    rationale: z
      .string()
      .describe('One sentence on why that region works, or why nothing does when region is "none".'),
  })
  .describe('Where text can be laid over this image, for hero and banner use.');

export const roleFitSchema = z.object({
  roleId: z.enum(webRoleIds).describe('Which web slot from the supplied spec table this scores.'),
  fitScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      'How well the image suits this slot, 0 to 100. Judge the composition against the slot\'s aspect ratio and display size, and spread scores out rather than clustering everything in the 60s and 70s.',
    ),
  rationale: z
    .string()
    .describe(
      'One or two sentences on why it scores that way, referencing the crop this slot\'s ratio would force.',
    ),
  requiredEdits: z
    .array(z.string())
    .describe(
      'Concrete edits needed before the image can ship in this slot, e.g. "crop to 12:5, losing the lower third" or "raise exposure, the subject is underlit". Empty array if it is ready as-is.',
    ),
});

export const technicalIssueSchema = z.object({
  severity: z
    .enum(['low', 'medium', 'high'])
    .describe('How much this blocks shipping the image on a real site.'),
  issue: z.string().describe('The problem, stated plainly.'),
  recommendation: z.string().describe('The specific fix.'),
});

export const optimizationSchema = z
  .object({
    recommendedFormat: z
      .enum(['webp', 'avif', 'jpeg', 'png', 'svg'])
      .describe('The delivery format this image should ship as on the web.'),
    formatAdvice: z
      .string()
      .describe(
        'Why that format, judged against the measured source format. This is where calls like "this PNG is a photograph and should ship as WebP" or "keep this one vector, do not raster-export it" belong.',
      ),
    targetMaxWeightKb: z
      .number()
      .int()
      .positive()
      .describe('A realistic budget in kilobytes for the optimised file at web display size.'),
    compressionAdvice: z
      .string()
      .describe(
        'How to hit that budget: quality level, whether the content tolerates aggressive compression, and any resize to do first.',
      ),
  })
  .describe('Delivery advice, grounded in the measured file size and format given to you.');

export const accessibilitySchema = z
  .object({
    suggestedAltText: z
      .string()
      .describe(
        'Alt text describing the image content for a screen reader. Under 125 characters, no "image of" or "photo of" prefix. Empty string if isDecorative is true.',
      ),
    isDecorative: z
      .boolean()
      .describe(
        'True when the image carries no information and should be given an empty alt attribute, such as a pure texture or background flourish.',
      ),
    contrastNotes: z
      .string()
      .describe(
        'Contrast or legibility risks if UI is placed over this image. Empty string if there are none.',
      ),
  })
  .describe('Accessibility guidance for shipping this image.');

export const imageAnalysisSchema = z.object({
  summary: z
    .string()
    .describe('Two or three sentences on what the image is and how usable it is on the web.'),
  subject: z.string().describe('The main subject, in a short noun phrase.'),
  contentType: contentTypeSchema,
  mood: z
    .string()
    .describe('The tone the image projects, as a few adjectives, e.g. "calm, airy, editorial".'),
  paletteDescription: z
    .string()
    .describe(
      'The colour story in words, naming the dominant and accent colours and how they would sit against a site theme. The measured hex palette is supplied to you; interpret it, do not restate it.',
    ),
  focalPoint: focalPointSchema,
  overlayTextSafeZone: overlayTextSafeZoneSchema,
  roleFits: z
    .array(roleFitSchema)
    .describe(
      'One entry for every role id in the supplied spec table, scored independently. Do not skip roles that fit badly; a low score is useful information.',
    ),
  technicalIssues: z
    .array(technicalIssueSchema)
    .describe(
      'Problems with the file itself, judged against the measured metadata: too small for its intended use, wrong format, oversized file, low resolution, heavy noise, blur, colour cast. Empty array if there are none.',
    ),
  optimization: optimizationSchema,
  accessibility: accessibilitySchema,
});

export type WebRoleIdValue = z.infer<typeof webRoleIdSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
export type FocalPoint = z.infer<typeof focalPointSchema>;
export type OverlayTextSafeZone = z.infer<typeof overlayTextSafeZoneSchema>;
export type RoleFit = z.infer<typeof roleFitSchema>;
export type TechnicalIssue = z.infer<typeof technicalIssueSchema>;
export type Optimization = z.infer<typeof optimizationSchema>;
export type Accessibility = z.infer<typeof accessibilitySchema>;
export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;
