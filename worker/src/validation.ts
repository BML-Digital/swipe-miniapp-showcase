import { z } from "zod";

export const cartSchema = z
  .array(
    z
      .object({
        productId: z.enum(["swipe-tee", "swipe-cap", "swipe-mug"]),
        variant: z.enum(["S", "M", "L", "XL", "ONE"]),
        quantity: z.number().int().min(1).max(9),
      })
      .strict(),
  )
  .min(1)
  .max(12);
export const deliverySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    mobile: z
      .string()
      .max(40)
      .transform((v) => v.replace(/\s+/g, ""))
      .pipe(z.string().regex(/^(?:\+?960)?[79]\d{6}$/)),
    address: z.string().trim().min(1).max(500),
    island: z.string().trim().min(2).max(80),
    notes: z.string().trim().max(240).default(""),
  })
  .strict();
export const orderSchema = z
  .object({ items: cartSchema, delivery: deliverySchema })
  .strict();
export const proofSchema = z
  .object({
    receiptId: z.string().regex(/^rcpt_mock_[a-zA-Z0-9_-]{1,100}$/),
    authToken: z.string().regex(/^mock\.receipt\.[a-zA-Z0-9_-]{1,100}$/),
  })
  .strict();

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new RequestError("Use application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("JSON body is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new RequestError("Request body is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError("Invalid JSON.", 400);
  }
}
