import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

export const editFixInstructionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set_document_title'),
    title: nonEmptyString,
  }),
  z.object({
    type: z.literal('set_document_language'),
    language: nonEmptyString,
  }),
  z.object({
    type: z.literal('set_pdfua_identification'),
    language: nonEmptyString,
  }),
  z.object({
    type: z.literal('set_figure_alt_text'),
    objectRef: nonEmptyString,
    altText: nonEmptyString,
  }),
  z.object({
    type: z.literal('mark_figure_decorative'),
    objectRef: nonEmptyString,
  }),
]);

export const editFixInstructionListSchema = z.array(editFixInstructionSchema).min(1);

export type EditFixInstruction = z.infer<typeof editFixInstructionSchema>;
