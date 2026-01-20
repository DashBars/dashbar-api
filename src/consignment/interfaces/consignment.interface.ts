/**
 * Summary of consignment stock for a specific bar/drink/supplier combination
 */
export interface ConsignmentReturnSummary {
  barId: number;
  barName: string;
  supplierId: number;
  supplierName: string;
  drinkId: number;
  drinkName: string;
  drinkSku: string;
  // Current state
  currentStockQuantity: number; // Stock.quantity actual (what remains to be returned)
  // Historical tracking (for transparency)
  totalReceived: number;        // Total inputs of this consignment lot
  totalConsumed: number;        // Total sales from this lot
  totalReturned: number;        // Already returned quantity
  // Computed
  quantityToReturn: number;     // = currentStockQuantity (system-determined, non-negotiable)
}

/**
 * Summary grouped by supplier
 */
export interface SupplierReturnSummary {
  supplierId: number;
  supplierName: string;
  items: ConsignmentReturnSummary[];
  totalToReturn: number;
}

/**
 * Event-level summary of all consignment returns
 */
export interface EventConsignmentSummary {
  eventId: number;
  eventName: string;
  bySupplier: SupplierReturnSummary[];
  grandTotal: number;
}

/**
 * Result of executing a return
 */
export interface ExecuteReturnResult {
  returnId: number;
  barId: number;
  drinkId: number;
  drinkSku: string;
  supplierId: number;
  quantityReturned: number;
  returnedAt: Date;
  performedById: number;
}
