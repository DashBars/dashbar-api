import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RecipesRepository } from './recipes.repository';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipesRepository],
  exports: [RecipesService],
})
export class RecipesModule {}
