import { z } from "zod";
export const STORE = "nova-leoes";
export const statuses = {
  AWAITING_APPROVAL: "Aguardando aprovação",
  STOCK_PENDING: "Verificando estoque",
  STOCK_REJECTED: "Estoque não confirmado",
  EXPIRED: "Reserva vencida",
  NEW: "Novo",
  CONFIRMED: "Confirmado",
  PACKING: "Em separação",
  READY: "Pronto para retirada",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
} as const;
export type Status = keyof typeof statuses;
export const transitions: Record<Status, Status[]> = {
  AWAITING_APPROVAL: ["CONFIRMED", "CANCELLED"],
  STOCK_PENDING: [],
  STOCK_REJECTED: ["CANCELLED"],
  EXPIRED: ["CANCELLED"],
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKING", "CANCELLED"],
  PACKING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
export const orderInput = z
  .object({
    idempotency: z.string().uuid(),
    customerName: z.string().trim().min(3).max(100),
    email: z.string().trim().email().max(150),
    phone: z
      .string()
      .trim()
      .regex(/^[\d\s()+-]{10,22}$/),
    vehicle: z.string().trim().max(150),
    note: z.string().trim().max(500),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(80),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.productId)).size === v.items.length,
    "Peças repetidas no pedido",
  );
export const productInput = z
  .object({
    name: z.string().trim().min(3).max(140),
    sku: z.string().trim().min(1).max(40),
    brand: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(50),
    priceCents: z.number().int().min(1).max(100000000),
    stock: z.number().int().min(0).max(100000),
    description: z.string().trim().max(1500),
    published: z.boolean(),
  })
  .strict();
export type OrderItem = {
  productId: string;
  name: string;
  sku: string;
  image: string;
  quantity: number;
  priceCents: number;
};
export type Order = {
  id: string;
  number: string;
  customerName: string;
  email: string;
  phone: string;
  vehicle: string;
  note: string;
  items: OrderItem[];
  totalCents: number;
  status: Status;
  createdAt: string;
  updatedAt: string;
  revision: number;
  approvedBy?: string | null;
  approvedAt?: string | null;
  inventoryMode?: "standalone" | "erp";
  inventoryStatus?: string;
  erpRevision?: number;
  reservationExpiresAt?: string | null;
};
export function normalizeSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
