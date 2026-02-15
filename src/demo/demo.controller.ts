import {
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Body,
} from '@nestjs/common';
import { DemoService } from './demo.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * Create a fully configured demo event with bars, stock, recipes, POS, and thresholds.
   * Returns the event data and IDs needed for simulation.
   */
  @Post('setup')
  async setup(@CurrentUser() user: User) {
    return this.demoService.setupDemoEvent(user.id);
  }

  /**
   * Start simulating random sales on the given event.
   * Sales will be created every ~6 seconds by default.
   */
  @Post(':eventId/simulate/start')
  async startSimulation(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body?: { intervalMs?: number },
  ) {
    return this.demoService.startSimulation(eventId, body?.intervalMs);
  }

  /**
   * Stop the simulation for the given event.
   */
  @Post(':eventId/simulate/stop')
  async stopSimulation(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.demoService.stopSimulation(eventId);
  }

  /**
   * Get simulation status for the given event.
   */
  @Get(':eventId/simulate/status')
  getStatus(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.demoService.getSimulationStats(eventId);
  }
}
