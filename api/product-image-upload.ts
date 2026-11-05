import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default {
async fetch(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const dataApiUrl = process.env.VITE_NEON_DATA_API_URL;
  if (!dataApiUrl) return Response.json({ error: 'Falta configurar Neon Data API en Vercel.' }, { status: 500 });

  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const accessToken = clientPayload?.trim();
        if (!accessToken || accessToken.length > 10_000) throw new Error('Inicia sesión para subir imágenes.');

        const response = await fetch(`${dataApiUrl.replace(/\/$/, '')}/businesses?select=id&limit=1`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('No se pudo validar tu sesión con Neon. Vuelve a iniciar sesión.');
        const businesses = await response.json() as unknown[];
        if (!businesses.length) throw new Error('Necesitas tener un negocio configurado para subir imágenes.');

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: MAX_IMAGE_SIZE,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo subir la imagen.';
    return Response.json({ error: message }, { status: 400 });
  }
},
};
