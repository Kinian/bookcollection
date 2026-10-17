// Couvertures embarquées : une copie JPEG réduite est stockée dans la fiche du livre (data URL),
// pour ne plus dépendre d'une URL externe qui peut disparaître, et pour l'avoir hors ligne.

const MAX_W = 320;
const MAX_H = 480;
const QUALITY = 0.8;

export const isEmbedded = (url?: string) => !!url?.startsWith('data:');

/** Redimensionne une image (fichier de la galerie ou image téléchargée) en JPEG compact. */
export async function blobToCover(blob: Blob): Promise<string> {
  const src = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = src;
    });
    const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // fond blanc pour les PNG transparents
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(src);
  }
}

async function fetchImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    const blob = res.ok ? await res.blob() : null;
    return blob?.type.startsWith('image/') ? blob : null;
  } catch {
    return null; // CORS refusé, réseau…
  }
}

/** Télécharge une couverture distante et la convertit ; undefined si elle est inaccessible. */
export async function embedCover(url: string): Promise<string | undefined> {
  if (isEmbedded(url)) return url;
  // Google Books n'autorise pas la lecture depuis le navigateur (CORS) : on passe alors par un proxy d'images.
  const blob =
    (await fetchImage(url)) ??
    (await fetchImage(`https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&w=${MAX_W}&output=jpg`));
  if (!blob) return undefined;
  try {
    return await blobToCover(blob);
  } catch {
    return undefined;
  }
}
