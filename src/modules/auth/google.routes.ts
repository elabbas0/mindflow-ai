import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { NotConfiguredError } from '../../shared/errors.js';

const profileJson = {
  type: 'object',
  properties: {
    email: { type: 'string' },
    name: { type: ['string', 'null'] },
    picture: { type: ['string', 'null'] },
  },
};

/**
 * iOS standalone PWAs cannot use Google popups (the popup escapes into a
 * separate browser sheet with no shared session). Instead the web app uses
 * the OAuth auth-code + redirect flow there: Google navigates back to the
 * app with ?code=..., and this endpoint exchanges it server-side (the
 * client secret never touches the browser) and returns the verified
 * Google profile. The frontend then proceeds with its normal
 * gmail-based account lookup/registration.
 */
export async function googleAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/auth/google',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange a Google OAuth auth-code for the verified profile (iOS redirect flow)',
        body: {
          type: 'object',
          required: ['code', 'redirectUri'],
          properties: {
            code: { type: 'string' },
            redirectUri: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, profile: profileJson } },
          400: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } },
          502: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } },
          503: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const parsed = z
        .object({ code: z.string().min(1), redirectUri: z.string().min(1) })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'code and redirectUri are required.' });
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return reply.code(503).send({ ok: false, error: new NotConfiguredError('Google OAuth').message });
      }

      let tokens: { access_token?: string };
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: parsed.data.code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: parsed.data.redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        if (!tokenRes.ok) {
          return reply.code(400).send({ ok: false, error: 'Google sign-in failed. Please try again.' });
        }
        tokens = (await tokenRes.json()) as { access_token?: string };
      } catch {
        return reply.code(502).send({ ok: false, error: 'Could not reach Google. Please try again.' });
      }
      if (!tokens.access_token) {
        return reply.code(400).send({ ok: false, error: 'Google sign-in failed. Please try again.' });
      }

      try {
        const meRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!meRes.ok) return reply.code(502).send({ ok: false, error: 'Could not verify Google profile.' });
        const me = (await meRes.json()) as { email?: string; name?: string; picture?: string };
        if (!me.email) return reply.code(502).send({ ok: false, error: 'Could not verify Google profile.' });
        // Only identity leaves the server — tokens stay server-side.
        return reply.send({
          ok: true,
          profile: { email: me.email, name: me.name ?? null, picture: me.picture ?? null },
        });
      } catch {
        return reply.code(502).send({ ok: false, error: 'Could not verify Google profile.' });
      }
    },
  );
}
