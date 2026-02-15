export interface DonorSuggestion {
  barId: number;
  barName: string;
  availableSurplus: number;
  suggestedQuantity: number;
}

export interface AlertCreatedEvent {
  eventId: number;
  barId: number;
  alertId: number;
  drinkId: number;
  drinkName: string;
  sellAsWholeUnit: boolean;
  type: 'low_stock' | 'projected_depletion';
  message: string;
  currentStock: number;
  threshold: number;
  suggestedDonors: DonorSuggestion[];
  externalNeeded: boolean;
  projectedMinutes?: number;
  createdAt: Date;
}

export interface BarWithStock {
  id: number;
  name: string;
  totalStock: number;
}
