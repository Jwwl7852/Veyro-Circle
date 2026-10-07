export const MAX_LISTING_IMAGES = 2;
export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_COMPRESSED_IMAGE_BYTES = 900 * 1024;
export const MAX_IMAGE_EDGE = 1600;

export type CompressedListingImage = {
  src: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  storagePath?: string;
};

export function isSupportedImageType(type: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(type.toLowerCase());
}

export function fitWithinBounds(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  if (width <= 0 || height <= 0 || maxEdge <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Billedet kunne ikke læses."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Billedet kunne ikke åbnes."));
    };
    image.src = url;
  });
}

function exportJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("Billedet kunne ikke komprimeres.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function compressListingImage(file: File): Promise<CompressedListingImage> {
  if (!isSupportedImageType(file.type)) {
    throw new Error("Vælg et JPG-, PNG- eller WEBP-billede.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Billedet må højst fylde 12 MB før komprimering.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Billedet kunne ikke behandles på denne enhed.");

  let output: Blob | null = null;
  let size = fitWithinBounds(image.naturalWidth, image.naturalHeight);
  const attempts = [
    { maxEdge: 1600, quality: 0.78 },
    { maxEdge: 1400, quality: 0.7 },
    { maxEdge: 1200, quality: 0.62 },
    { maxEdge: 1000, quality: 0.56 },
  ];

  for (const attempt of attempts) {
    size = fitWithinBounds(image.naturalWidth, image.naturalHeight, attempt.maxEdge);
    canvas.width = size.width;
    canvas.height = size.height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    output = await exportJpeg(canvas, attempt.quality);
    if (output.size <= MAX_COMPRESSED_IMAGE_BYTES) break;
  }

  if (!output || output.size > MAX_COMPRESSED_IMAGE_BYTES) {
    throw new Error("Billedet er stadig for stort efter komprimering. Vælg et andet billede.");
  }

  return {
    src: await readAsDataUrl(output),
    name: file.name,
    bytes: output.size,
    width: size.width,
    height: size.height,
  };
}

export function formatImageSize(bytes: number, lang: "da" | "sv") {
  const kilobytes = Math.max(1, Math.round(bytes / 1024));
  return lang === "da" ? `${kilobytes} KB efter komprimering` : `${kilobytes} KB efter komprimering`;
}
