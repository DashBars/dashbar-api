import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AssistantService } from './assistant.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  /**
   * GET /assistant/status
   * Check if assistant is enabled
   */
  @Get('status')
  getStatus() {
    return { enabled: this.assistantService.isEnabled() };
  }

  /**
   * POST /assistant/chat
   * Streams the AI response via SSE (Server-Sent Events)
   */
  @Post('chat')
  async chat(
    @CurrentUser() user: User,
    @Body() body: { message: string; conversationId?: number },
    @Res() res: Response,
  ) {
    if (!body.message?.trim()) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    try {
      const stream = this.assistantService.chatStream(
        user.id,
        body.message.trim(),
        body.conversationId,
      );

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', data: { message: err.message || 'Internal error' } })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * POST /assistant/chat/sync
   * Non-streaming version for simpler clients
   */
  @Post('chat/sync')
  async chatSync(
    @CurrentUser() user: User,
    @Body() body: { message: string; conversationId?: number },
  ) {
    if (!body.message?.trim()) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }

    return this.assistantService.chat(
      user.id,
      body.message.trim(),
      body.conversationId,
    );
  }

  /**
   * GET /assistant/conversations
   * List all conversations for the authenticated user
   */
  @Get('conversations')
  async listConversations(@CurrentUser() user: User) {
    return this.assistantService.listConversations(user.id);
  }

  /**
   * GET /assistant/conversations/:id
   * Get a specific conversation with messages
   */
  @Get('conversations/:id')
  async getConversation(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const conversation = await this.assistantService.getConversation(user.id, id);
    if (!conversation) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }
    return conversation;
  }

  /**
   * DELETE /assistant/conversations/:id
   */
  @Delete('conversations/:id')
  async deleteConversation(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assistantService.deleteConversation(user.id, id);
    return { success: true };
  }
}
