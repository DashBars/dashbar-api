import { Module } from '@nestjs/common';
import { RecipeOverridesController } from './recipe-overrides.controller';
import { RecipeOverridesService } from './recipe-overrides.service';
import { RecipeOverridesRepository } from './recipe-overrides.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { BarsModule } from '../bars/bars.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, BarsModule, EventsModule],
  controllers: [RecipeOverridesController],
  providers: [RecipeOverridesService, RecipeOverridesRepository],
  exports: [RecipeOverridesService, RecipeOverridesRepository],
})
export class RecipeOverridesModule {}
