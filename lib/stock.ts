// Sklad produktů: typy a pravidlo, kdy produkt dochází (sdílí administrace i API).
export type StockProduct = {id: string; name: string; priceCents: number; active: number; sort: number; stock: number | null; minStock: number | null; costCents: number | null};
export type StockMove = {id: string; productId: string; date: string; kind: string; delta: number; stockAfter: number | null; receiptId: string | null; note: string};
/** Produkt dochází: sleduje se sklad, je nabízený a počet klesl na minimum (nebo pod nulu). */
export const isLow = (p: Pick<StockProduct, 'stock' | 'minStock' | 'active'>) => p.stock !== null && !!p.active && p.stock <= (p.minStock ?? 0);
