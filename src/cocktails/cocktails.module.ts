import { Module } from '@nestjs/common';
import { CocktailsController } from './cocktails.controller';
import { CocktailsService } from './cocktails.service';
import { CocktailsRepository } from './cocktails.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CocktailsController],
  providers: [CocktailsService, CocktailsRepository],
  exports: [CocktailsService, CocktailsRepository],
})
export class CocktailsModule {}
