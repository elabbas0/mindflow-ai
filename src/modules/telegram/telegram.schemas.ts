import { z } from 'zod';

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
      from: z.object({ id: z.number(), language_code: z.string().optional() }).optional(),
      text: z.string().optional(),
      caption: z.string().optional(),
      voice: z.object({ file_id: z.string() }).optional(),
      document: z
        .object({ file_id: z.string(), file_name: z.string().optional(), mime_type: z.string().optional() })
        .optional(),
      photo: z.array(z.object({ file_id: z.string() })).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
