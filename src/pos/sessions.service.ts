import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SessionsRepository, POSSessionWithRelations } from './sessions.repository';
import { PosnetsService } from './posnets.service';
import { PosnetStatus } from '@prisma/client';

export interface OpenSessionDto {
  openingFloat?: number;
  notes?: string;
}

export interface CloseSessionDto {
  closingFloat?: number;
  notes?: string;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly posnetsService: PosnetsService,
  ) {}

  /**
   * Open a new session for a POS terminal
   */
  async openSession(
    posnetId: number,
    userId: number,
    dto: OpenSessionDto,
  ): Promise<POSSessionWithRelations> {
    // Validate POS terminal exists and is enabled
    const posnet = await this.posnetsService.findById(posnetId);
    
    if (!posnet.enabled) {
      throw new ForbiddenException('POS terminal is disabled');
    }

    // Check if there's already an active session
    const existingSession = await this.sessionsRepository.findActiveByPosnetId(posnetId);
    if (existingSession) {
      throw new BadRequestException(
        `POS terminal already has an active session (ID: ${existingSession.id}). Close it first.`,
      );
    }

    // Create the session
    const session = await this.sessionsRepository.create({
      posnetId,
      openedByUserId: userId,
      openingFloat: dto.openingFloat,
      notes: dto.notes,
    });

    // Update POS status to OPEN
    await this.posnetsService.updateStatus(posnetId, PosnetStatus.OPEN);

    return session;
  }

  /**
   * Close an active session
   */
  async closeSession(
    posnetId: number,
    sessionId: number,
    dto: CloseSessionDto,
  ): Promise<POSSessionWithRelations> {
    // Validate session exists and belongs to this POS
    const session = await this.sessionsRepository.findById(sessionId);
    
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    if (session.posnetId !== posnetId) {
      throw new BadRequestException('Session does not belong to this POS terminal');
    }

    if (session.closedAt) {
      throw new BadRequestException('Session is already closed');
    }

    // Close the session
    const closedSession = await this.sessionsRepository.close(sessionId, {
      closingFloat: dto.closingFloat,
      notes: dto.notes,
    });

    // Update POS status to CLOSED
    await this.posnetsService.updateStatus(posnetId, PosnetStatus.CLOSED);

    return closedSession;
  }

  /**
   * Get active session for a POS terminal
   */
  async getActiveSession(posnetId: number): Promise<POSSessionWithRelations | null> {
    return this.sessionsRepository.findActiveByPosnetId(posnetId);
  }

  /**
   * Get all sessions for a POS terminal
   */
  async getSessionHistory(posnetId: number): Promise<POSSessionWithRelations[]> {
    // Validate POS exists
    await this.posnetsService.findById(posnetId);
    return this.sessionsRepository.findByPosnetId(posnetId);
  }

  /**
   * Get session summary with sales totals
   */
  async getSessionSummary(sessionId: number) {
    const summary = await this.sessionsRepository.getSessionSummary(sessionId);
    if (!summary) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }
    return summary;
  }

  /**
   * Find session by ID
   */
  async findById(sessionId: number): Promise<POSSessionWithRelations> {
    const session = await this.sessionsRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }
    return session;
  }
}
