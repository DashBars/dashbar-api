import { Module } from '@nestjs/common';
import { DrinksController } from './drinks.controller';
import { DrinksService } from './drinks.service';
import { DrinksRepository } from './drinks.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DrinksController],
  providers: [DrinksService, DrinksRepository],
  exports: [DrinksService],
})
export class DrinksModule {}
