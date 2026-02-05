import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PosnetsRepository, PosnetWithRelations } from './posnets.repository';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';
import { CreatePosnetDto, UpdatePosnetDto, PosLoginDto } from './dto';
import { PosnetStatus } from '@prisma/client';

export interface PosTokenPayload {
  posnetId: number;
  eventId: number;
  barId: number;
  code: string;
  type: 'pos'; // Distinguish from user JWTs
}

@Injectable()
export class PosnetsService {
  private readonly posJwtSecret: string;
  private readonly posJwtExpiresIn: string;

  constructor(
    private readonly posnetsRepository: PosnetsRepository,
    private readonly eventsService: EventsService,
    private readonly barsService: BarsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.posJwtSecret = this.configService.get<string>('POS_JWT_SECRET') || 'pos-secret-key';
    this.posJwtExpiresIn = this.configService.get<string>('POS_JWT_EXPIRES_IN') || '15m';
  }

  /**
   * Generate a unique POS code (e.g., "POS-A1B2C3")
   */
  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      const randomPart = randomBytes(3).toString('hex').toUpperCase();
      code = `POS-${randomPart}`;
      attempts++;
    } while ((await this.posnetsRepository.codeExists(code)) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new BadRequestException('Unable to generate unique POS code. Please try again.');
    }

    return code;
  }

  /**
   * Generate a secure auth token for POS device
   */
  private generateAuthToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create a new POS terminal
   */
  async create(
    eventId: number,
    userId: number,
    dto: CreatePosnetDto,
  ): Promise<PosnetWithRelations> {
    // Validate event exists and user has access
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new ForbiddenException('Only event owner can create POS terminals');
    }

    // Validate bar exists and belongs to event (findOne throws if not found)
    await this.barsService.findOne(eventId, dto.barId, userId);

    // Generate code if not provided
    const code = dto.code || (await this.generateUniqueCode());

    // Check if code already exists
    if (dto.code && (await this.posnetsRepository.codeExists(code))) {
      throw new BadRequestException(`POS code "${code}" already exists`);
    }

    // Generate auth token
    const authToken = this.generateAuthToken();

    return this.posnetsRepository.create({
      code,
      name: dto.name,
      eventId,
      barId: dto.barId,
      authToken,
    });
  }

  /**
   * Get all POS terminals for an event
   */
  async findByEvent(eventId: number, userId: number): Promise<PosnetWithRelations[]> {
    // Validate event exists
    await this.eventsService.findById(eventId);
    return this.posnetsRepository.findByEventId(eventId);
  }

  /**
   * Get a specific POS terminal
   */
  async findById(id: number): Promise<PosnetWithRelations> {
    const posnet = await this.posnetsRepository.findById(id);
    if (!posnet) {
      throw new NotFoundException(`POS terminal with ID ${id} not found`);
    }
    return posnet;
  }

  /**
   * Update a POS terminal
   */
  async update(
    id: number,
    userId: number,
    dto: UpdatePosnetDto,
  ): Promise<PosnetWithRelations> {
    const posnet = await this.findById(id);

    // Validate user has access to the event
    const event = await this.eventsService.findByIdWithOwner(posnet.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new ForbiddenException('Only event owner can update POS terminals');
    }

    return this.posnetsRepository.update(id, dto);
  }

  /**
   * Delete a POS terminal
   */
  async delete(id: number, userId: number): Promise<void> {
    const posnet = await this.findById(id);

    // Validate user has access to the event
    const event = await this.eventsService.findByIdWithOwner(posnet.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new ForbiddenException('Only event owner can delete POS terminals');
    }

    await this.posnetsRepository.delete(id);
  }

  /**
   * Rotate auth token for a POS terminal
   */
  async rotateToken(id: number, userId: number): Promise<{ authToken: string }> {
    const posnet = await this.findById(id);

    // Validate user has access to the event
    const event = await this.eventsService.findByIdWithOwner(posnet.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new ForbiddenException('Only event owner can rotate POS token');
    }

    const authToken = this.generateAuthToken();
    await this.posnetsRepository.update(id, { authToken });

    return { authToken };
  }

  /**
   * POS device login - authenticate via code or token
   */
  async login(dto: PosLoginDto): Promise<{ accessToken: string; posnet: PosnetWithRelations }> {
    if (!dto.code && !dto.authToken) {
      throw new BadRequestException('Either code or authToken must be provided');
    }

    let posnet: PosnetWithRelations | null = null;

    if (dto.code) {
      posnet = await this.posnetsRepository.findByCode(dto.code);
    } else if (dto.authToken) {
      posnet = await this.posnetsRepository.findByAuthToken(dto.authToken);
    }

    if (!posnet) {
      throw new UnauthorizedException('Invalid POS credentials');
    }

    if (!posnet.enabled) {
      throw new ForbiddenException('POS terminal is disabled');
    }

    // Generate POS session JWT
    const payload: PosTokenPayload = {
      posnetId: posnet.id,
      eventId: posnet.eventId,
      barId: posnet.barId,
      code: posnet.code,
      type: 'pos',
    };

    const accessToken = this.jwtService.sign(payload as unknown as Record<string, unknown>, {
      secret: this.posJwtSecret,
      expiresIn: '15m' as const,
    });

    // Update heartbeat
    await this.posnetsRepository.updateHeartbeat(posnet.id);

    return { accessToken, posnet };
  }

  /**
   * Verify a POS JWT token
   */
  verifyPosToken(token: string): PosTokenPayload {
    try {
      const payload = this.jwtService.verify<PosTokenPayload>(token, {
        secret: this.posJwtSecret,
      });

      if (payload.type !== 'pos') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired POS token');
    }
  }

  /**
   * Update POS status
   */
  async updateStatus(id: number, status: PosnetStatus): Promise<PosnetWithRelations> {
    await this.findById(id); // Validate exists
    return this.posnetsRepository.update(id, { status });
  }

  /**
   * Get active session for a POS terminal
   */
  async getActiveSession(posnetId: number) {
    return this.posnetsRepository.getActiveSession(posnetId);
  }

  /**
   * Record heartbeat from POS terminal
   */
  async recordHeartbeat(posnetId: number): Promise<void> {
    await this.posnetsRepository.updateHeartbeat(posnetId);
  }
}
