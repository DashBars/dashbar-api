import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BarsModule } from './bars/bars.module';
import { StockModule } from './stock/stock.module';
import { RecipesModule } from './recipes/recipes.module';
import { PricesModule } from './prices/prices.module';
import { EventsModule } from './events/events.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RecipeOverridesModule } from './recipe-overrides/recipe-overrides.module';
import { SalesModule } from './sales/sales.module';
import { CategoriesModule } from './categories/categories.module';
import { CatalogModule } from './catalog/catalog.module';
import { CocktailsModule } from './cocktails/cocktails.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AlarmsModule } from './alarms/alarms.module';
import { TransfersModule } from './transfers/transfers.module';
import { ReportsModule } from './reports/reports.module';
import { POSModule } from './pos/pos.module';
import { ConsignmentModule } from './consignment/consignment.module';
import { DrinksModule } from './drinks/drinks.module';
import { VenuesModule } from './venues/venues.module';
import { ManagerInventoryModule } from './manager-inventory/manager-inventory.module';
import { GlobalInventoryModule } from './global-inventory/global-inventory.module';
import { ReturnPolicyModule } from './return-policy/return-policy.module';
import { ProductsModule } from './products/products.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    EventsModule,
    BarsModule,
    StockModule,
    RecipesModule,
    PricesModule,
    SuppliersModule,
    RecipeOverridesModule,
    SalesModule,
    CategoriesModule,
    CatalogModule,
    CocktailsModule,
    DashboardModule,
    AlarmsModule,
    TransfersModule,
    ReportsModule,
    POSModule,
    ConsignmentModule,
    DrinksModule,
    VenuesModule,
    ManagerInventoryModule,
    GlobalInventoryModule,
    ReturnPolicyModule,
    ProductsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
