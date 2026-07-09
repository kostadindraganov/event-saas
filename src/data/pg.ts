// drizzle-orm/neon-serverless обвива pg грешката — реалният код е в err.cause.code
export function pgCode(err: unknown): string | undefined {
  return (err as { cause?: { code?: string } })?.cause?.code;
}
