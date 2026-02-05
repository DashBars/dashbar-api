export interface ReceiptLine {
  cocktailId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Receipt {
  orderId: string;
  eventId: number;
  barId: number;
  barName: string;
  lines: ReceiptLine[];
  itemCount: number;
  subtotal: number;
  total: number;
  createdAt: Date;
}
