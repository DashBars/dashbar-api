import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { PosnetsService } from './posnets.service';
import { POSSalesService } from './pos-sales.service';
import { SessionsService } from './sessions.service';
import { CreatePosnetDto, UpdatePosnetDto, PosLoginDto, OpenSessionDto, CloseSessionDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@Controller()
export class PosnetsController {
  constructor(
    private readonly posnetsService: PosnetsService,
    private readonly posSalesService: POSSalesService,
    private readonly sessionsService: SessionsService,
  ) {}

  // ============================================
  // Admin/Manager endpoints (require user auth)
  // ============================================

  /**
   * Create a new POS terminal for an event
   */
  @Post('events/:eventId/posnets')
  @Roles(UserRole.manager, UserRole.admin)
  async create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreatePosnetDto,
  ) {
    return this.posnetsService.create(eventId, user.id, dto);
  }

  /**
   * List all POS terminals for an event
   */
  @Get('events/:eventId/posnets')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async findByEvent(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.posnetsService.findByEvent(eventId, user.id);
  }

  /**
   * Get a specific POS terminal by ID
   */
  @Get('posnets/:id')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.posnetsService.findById(id);
  }

  /**
   * Update a POS terminal
   */
  @Patch('posnets/:id')
  @Roles(UserRole.manager, UserRole.admin)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: UpdatePosnetDto,
  ) {
    return this.posnetsService.update(id, user.id, dto);
  }

  /**
   * Delete a POS terminal
   */
  @Delete('posnets/:id')
  @Roles(UserRole.manager, UserRole.admin)
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    await this.posnetsService.delete(id, user.id);
    return { success: true };
  }

  /**
   * Rotate the auth token for a POS terminal
   */
  @Post('posnets/:id/rotate-token')
  @Roles(UserRole.manager, UserRole.admin)
  async rotateToken(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.posnetsService.rotateToken(id, user.id);
  }

  /**
   * Get active session for a POS terminal
   */
  @Get('posnets/:id/session')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async getActiveSession(@Param('id', ParseIntPipe) id: number) {
    const session = await this.sessionsService.getActiveSession(id);
    return { session };
  }

  /**
   * Open a new session for a POS terminal
   */
  @Post('posnets/:id/sessions')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async openSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: OpenSessionDto,
  ) {
    return this.sessionsService.openSession(id, user.id, dto);
  }

  /**
   * Close a session
   */
  @Patch('posnets/:id/sessions/:sessionId/close')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async closeSession(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: CloseSessionDto,
  ) {
    return this.sessionsService.closeSession(id, sessionId, dto);
  }

  /**
   * Get session history for a POS terminal
   */
  @Get('posnets/:id/sessions')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async getSessionHistory(@Param('id', ParseIntPipe) id: number) {
    return this.sessionsService.getSessionHistory(id);
  }

  /**
   * Get session summary with sales totals
   */
  @Get('posnets/:id/sessions/:sessionId/summary')
  @Roles(UserRole.manager, UserRole.admin, UserRole.cashier)
  async getSessionSummary(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.sessionsService.getSessionSummary(sessionId);
  }

  /**
   * Get paginated sales for an event
   */
  @Get('events/:eventId/sales')
  @Roles(UserRole.manager, UserRole.admin)
  async getEventSales(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.posSalesService.getEventSales(eventId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
  }

  // ============================================
  // POS device endpoints (public - use POS auth)
  // ============================================

  /**
   * POS device login - authenticate with code or token
   */
  @Post('pos/login')
  @Public()
  async login(@Body() dto: PosLoginDto) {
    return this.posnetsService.login(dto);
  }
}
