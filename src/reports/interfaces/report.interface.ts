export interface TopProductEntry {
  cocktailId: number;
  name: string;
  unitsSold: number;
  revenue: number;
  sharePercent: number;
  profit?: number; // Revenue - COGS for this product
}

// ============= ENHANCED REPORTING INTERFACES =============

/**
 * Time bucket sizes for peak hours analysis
 */
export type BucketSize = 5 | 15 | 60;

/**
 * Peak hours entry with configurable bucket size
 */
export interface PeakHourBucketEntry {
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  salesCount: number;
  revenue: number; // cents
  topProduct?: string; // Name of top product in this bucket
}

/**
 * Bar breakdown with all metrics
 */
export interface BarBreakdown {
  barId: number;
  barName: string;
  barType: string;
  // Totals
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  totalUnitsSold: number;
  totalOrderCount: number;
  avgTicketSize: number;
  // Top products for this bar
  topProducts: TopProductEntry[];
  // Peak hours for this bar (60-min buckets)
  peakHours: PeakHourEntry[];
}

/**
 * POS terminal breakdown
 */
export interface PosBreakdown {
  posnetId: number;
  posnetCode: string;
  posnetName: string;
  barId: number;
  barName: string;
  // Totals
  totalRevenue: number;
  totalTransactions: number;
  totalUnitsSold: number;
  avgTicketSize: number;
  // Busiest hours (60-min buckets)
  busiestHours: Array<{
    hour: string;
    transactions: number;
    revenue: number;
  }>;
}

/**
 * Stock valuation by bar
 */
export interface StockValuationItem {
  drinkId: number;
  drinkName: string;
  quantity: number;
  unitCost: number; // cents
  value: number; // cents (quantity * unitCost)
  ownershipMode: 'purchased' | 'consignment';
}

export interface BarStockValuation {
  barId: number;
  barName: string;
  totalValue: number; // cents
  purchasedValue: number; // cents
  consignmentValue: number; // cents
  items: StockValuationItem[];
}

export interface StockValuationSummary {
  totalValue: number; // cents
  purchasedValue: number; // cents
  consignmentValue: number; // cents
  byBar: BarStockValuation[];
}

/**
 * COGS breakdown by bar
 */
export interface CogsBreakdownByBar {
  barId: number;
  barName: string;
  totalCogs: number; // cents
  byDrink: Array<{
    drinkId: number;
    drinkName: string;
    quantityUsed: number;
    cost: number; // cents
  }>;
}

export interface PeakHourEntry {
  hour: string; // ISO timestamp
  units: number;
  revenue: number;
  orderCount: number;
}

export interface TimeSeriesEntry {
  timestamp: Date;
  units: number;
  amount: number;
}

export interface RemainingStockEntry {
  barId: number;
  barName: string;
  drinkId: number;
  drinkName: string;
  supplierId: number;
  supplierName: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  ownershipMode: 'purchased' | 'consignment';
}

export interface ConsumptionBySupplier {
  supplierId: number;
  supplierName: string;
  quantity: number;
  unitCost: number;
  cost: number;
  ownershipMode: 'purchased' | 'consignment';
}

export interface ConsumptionEntry {
  drinkId: number;
  drinkName: string;
  totalMl: number;
  totalCost: number;
  bySupplier: ConsumptionBySupplier[];
}

export interface ReportSummary {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  totalUnitsSold: number;
  totalOrderCount: number;
}

export interface RemainingStockSummary {
  totalValue: number;
  purchasedValue: number;
  consignmentValue: number;
  items: RemainingStockEntry[];
}

export interface ReportData {
  summary: ReportSummary;
  topProducts: TopProductEntry[];
  peakHours: PeakHourEntry[];
  timeSeries: TimeSeriesEntry[];
  remainingStock: RemainingStockSummary;
  consumptionByDrink: ConsumptionEntry[];
  warnings: string[];
  // Enhanced fields (optional for backward compatibility)
  peakHoursByBucket?: {
    '5min': PeakHourBucketEntry[];
    '15min': PeakHourBucketEntry[];
    '60min': PeakHourBucketEntry[];
  };
  barBreakdowns?: BarBreakdown[];
  posBreakdowns?: PosBreakdown[];
  stockValuation?: StockValuationSummary;
  cogsBreakdown?: CogsBreakdownByBar[];
  // Export paths
  csvPath?: string;
  pdfPath?: string;
}

// ============= COMPARISON INTERFACES =============

/**
 * Event eligible for comparison (finished events with generated report)
 */
export interface EligibleEventForComparison {
  eventId: number;
  eventName: string;
  startedAt: Date;
  finishedAt: Date;
  durationHours: number;
  hasReport: boolean;
}

/**
 * Normalized metrics for an event in comparison
 */
export interface EventComparisonRow {
  eventId: number;
  eventName: string;
  startedAt: Date;
  finishedAt: Date;
  durationHours: number;
  // Totals
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  totalUnitsSold: number;
  totalOrderCount: number;
  // Normalized per hour
  revenuePerHour: number;
  cogsPerHour: number;
  unitsPerHour: number;
  ordersPerHour: number;
}

/**
 * Product appearing in cross-event comparison
 */
export interface CrossEventProductByEvent {
  eventId: number;
  eventName: string;
  unitsSold: number;
  revenue: number;
  sharePercent: number;
  rank: number;
}

export interface CrossEventProduct {
  cocktailId: number;
  name: string;
  eventsAppeared: number;
  totalUnitsAcrossEvents: number;
  totalRevenueAcrossEvents: number;
  avgSharePercent: number;
  byEvent: CrossEventProductByEvent[];
}

/**
 * Peak time pattern analysis
 */
export interface PeakTimePatternEvent {
  eventId: number;
  eventName: string;
  units: number;
  revenue: number;
}

export interface PeakTimePattern {
  hourOfDay: number; // 0-23
  eventsWithPeak: number;
  eventDetails: PeakTimePatternEvent[];
}

/**
 * Automatic insights from comparison
 */
export type InsightType =
  | 'consistent_top_product'
  | 'peak_time_pattern'
  | 'margin_outlier'
  | 'volume_outlier';

export interface ComparisonInsight {
  type: InsightType;
  message: string;
  data: Record<string, any>;
}

/**
 * Time series for a single event in comparison
 */
export interface EventTimeSeries {
  eventId: number;
  eventName: string;
  series: TimeSeriesEntry[];
}

/**
 * Complete comparison report response
 */
export interface EventComparisonReport {
  generatedAt: Date;
  eventIds: number[];
  eventComparison: EventComparisonRow[];
  crossEventProducts: CrossEventProduct[];
  peakTimePatterns: PeakTimePattern[];
  timeSeriesByEvent: EventTimeSeries[];
  insights: ComparisonInsight[];
}
