import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { BarsModule } from './bars/bars.module';
import { StockModule } from './stock/stock.module';
import { RecipesModule } from './recipes/recipes.module';
import { PricesModule } from './prices/prices.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    EventsModule,
    BarsModule,
    StockModule,
    RecipesModule,
    PricesModule,
  ],
})
export class AppModule {}
