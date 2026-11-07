import { neon } from '@neondatabase/serverless';

type OrderBody = {
  token?: string;
  slug?: string;
  name?: string;
  phone?: string;
  address?: string;
  locationUrl?: string;
  notes?: string;
  items?: { product_id: string; quantity: number }[];
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
    const databaseUrl = process.env.DATABASE_URL;
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!databaseUrl || !turnstileSecret) {
      return Response.json({ error: 'El servidor todavía no está configurado para recibir pedidos seguros.' }, { status: 503 });
    }

    try {
      const body = await request.json() as OrderBody;
      if (!body.token || body.token.length > 2048) return Response.json({ error: 'Completa la verificación de seguridad.' }, { status: 400 });
      if (!body.slug || !body.name || !body.phone || !body.address || !Array.isArray(body.items)) {
        return Response.json({ error: 'Completa los datos requeridos del pedido.' }, { status: 400 });
      }

      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: turnstileSecret, response: body.token, remoteip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() }),
        signal: AbortSignal.timeout(8000),
      });
      if (!verification.ok) return Response.json({ error: 'No se pudo validar la verificación. Inténtalo de nuevo.' }, { status: 502 });
      const challenge = await verification.json() as { success?: boolean; hostname?: string };
      const requestHost = request.headers.get('host')?.split(':')[0]?.toLowerCase();
      if (!challenge.success || (challenge.hostname && requestHost && challenge.hostname.toLowerCase() !== requestHost)) {
        return Response.json({ error: 'La verificación venció o no fue válida. Vuelve a completarla.' }, { status: 403 });
      }

      const sql = neon(databaseUrl);
      const result = await sql`
        select public.create_public_order(
          ${body.slug}::text,
          ${body.name.trim()}::text,
          ${body.phone.trim()}::text,
          ${body.address.trim()}::text,
          ${body.locationUrl?.trim() || null}::text,
          ${body.notes?.trim() || null}::text,
          ${JSON.stringify(body.items)}::jsonb
        ) as order_data
      ` as { order_data: unknown }[];
      return Response.json(result[0]?.order_data ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar el pedido.';
      return Response.json({ error: message }, { status: 400 });
    }
  },
};
