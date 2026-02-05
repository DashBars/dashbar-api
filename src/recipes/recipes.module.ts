import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RecipesRepository } from './recipes.repository';
import { EventsModule } from '../events/events.module';
import { ProductsModule } from '../products/products.module';
import { BarsModule } from '../bars/bars.module';

@Module({
  imports: [EventsModule, ProductsModule, BarsModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipesRepository],
  exports: [RecipesService],
})
export class RecipesModule {}
