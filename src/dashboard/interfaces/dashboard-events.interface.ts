export interface SaleCreatedEvent {
  eventId: number;
  barId: number;
  sale: {
    id: number;
    cocktailId: number;
    quantity: number;
    createdAt: Date;
  };
  depletions: Array<{
    barId: number;
    drinkId: number;
    supplierId: number;
    quantityToDeduct: number;
  }>;
}

export interface SaleCreatedPayload {
  type: 'sale:created';
  eventId: number;
  barId: number;
  data: {
    saleId: number;
    cocktailId: number;
    cocktailName: string;
    quantity: number;
    totalAmount: number;
    createdAt: Date;
  };
}

export interface ConsumptionUpdatedPayload {
  type: 'consumption:updated';
  eventId: number;
  barId: number;
  data: {
    saleId: number;
    depletions: Array<{
      drinkId: number;
      drinkName: string;
      supplierId: number;
      quantityDeducted: number;
    }>;
  };
}

export interface DashboardTotals {
  sales: {
    totalAmount: number;
    totalUnits: number;
    orderCount: number;
  };
  consumption: {
    totalMl: number;
    byDrink: Array<{
      drinkId: number;
      name: string;
      totalMl: number;
    }>;
  };
}

export interface TimeSeriesPoint {
  timestamp: Date;
  units: number;
  amount: number;
}

export interface TimeSeriesResponse {
  bucketSize: string;
  series: TimeSeriesPoint[];
}

export interface TopProduct {
  cocktailId: number;
  name: string;
  units: number;
  amount: number;
}

export interface TopProductsResponse {
  products: TopProduct[];
}
