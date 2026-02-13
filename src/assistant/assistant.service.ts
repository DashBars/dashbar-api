import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { TOOL_DEFINITIONS, executeTool } from './assistant-tools';

const SYSTEM_PROMPT = `Sos el asistente IA de Dashbar, una plataforma de gestión de barras para eventos.
Tu rol es ayudar a los managers a consultar información sobre sus eventos, barras, stock, recetas, ventas y reportes.

Reglas:
- Respondé siempre en español argentino, de forma concisa y clara.
- Usá las herramientas disponibles para obtener datos reales antes de responder.
- Si no encontrás la información, decilo honestamente.
- Formateá números como moneda cuando corresponda (ej: $3.000,00).
- Cuando muestres listas o tablas, usá formato markdown.
- No inventes datos. Solo respondé con lo que obtengas de las herramientas.
- Si el usuario pregunta algo que no podés responder con las herramientas disponibles, sugerí alternativas.
- Sé proactivo: si ves algo interesante en los datos (ej: un producto que se vendió mucho), mencionalo.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private client: Anthropic | null = null;

  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.enabled = this.config.get<string>('ASSISTANT_ENABLED', 'false') === 'true';
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');

    if (this.enabled && apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('AI Assistant enabled');
    } else {
      this.logger.warn(
        this.enabled
          ? 'ANTHROPIC_API_KEY not set – assistant will be unavailable'
          : 'AI Assistant is disabled (ASSISTANT_ENABLED=false)',
      );
    }
  }

  isEnabled() {
    return this.enabled && this.client !== null;
  }

  // ── Conversations CRUD ────────────────────────────────────────

  async listConversations(userId: number) {
    return this.prisma.assistantConversation.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: { content: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getConversation(userId: number, conversationId: number) {
    return this.prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        messages: {
          select: { id: true, role: true, content: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async deleteConversation(userId: number, conversationId: number) {
    // Verify ownership
    const conv = await this.prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conv) throw new Error('Conversation not found');
    await this.prisma.assistantConversation.delete({ where: { id: conversationId } });
  }

  // ── Chat (non-streaming, returns full response) ───────────────

  async chat(
    userId: number,
    message: string,
    conversationId?: number,
  ): Promise<{ conversationId: number; response: string }> {
    if (!this.enabled || !this.client) {
      throw new Error('El asistente IA está desactivado. Activalo con ASSISTANT_ENABLED=true en el archivo .env.');
    }

    // Get or create conversation
    let conversation: any;
    if (conversationId) {
      conversation = await this.prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50, // Limit history to last 50 messages
          },
        },
      });
      if (!conversation) throw new Error('Conversation not found');
    } else {
      conversation = await this.prisma.assistantConversation.create({
        data: { userId },
        include: { messages: true },
      });
    }

    // Build message history for Claude
    const history: Anthropic.MessageParam[] = conversation.messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Add the new user message
    history.push({ role: 'user', content: message });

    // Save user message
    await this.prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Call Claude with tool use loop
    let assistantResponse = '';
    let currentMessages = [...history];
    const maxIterations = 10; // Prevent infinite tool loops

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages: currentMessages,
      });

      // Check if Claude wants to use tools
      if (response.stop_reason === 'tool_use') {
        // Find tool use blocks
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        // Execute each tool
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          this.logger.debug(`Executing tool: ${toolUse.name}`);
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId,
            this.prisma,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Add assistant response and tool results to history
        currentMessages.push({ role: 'assistant', content: response.content });
        currentMessages.push({ role: 'user', content: toolResults });
      } else {
        // Final text response
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        );
        assistantResponse = textBlocks.map((b) => b.text).join('\n');
        break;
      }
    }

    // Save assistant response
    await this.prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantResponse,
      },
    });

    // Generate title from first message if not set
    if (!conversation.title && message.length > 0) {
      const title = message.length > 60 ? message.substring(0, 57) + '...' : message;
      await this.prisma.assistantConversation.update({
        where: { id: conversation.id },
        data: { title },
      });
    }

    return {
      conversationId: conversation.id,
      response: assistantResponse,
    };
  }

  // ── Streaming chat via SSE ────────────────────────────────────

  async *chatStream(
    userId: number,
    message: string,
    conversationId?: number,
  ): AsyncGenerator<{ type: string; data: any }> {
    if (!this.enabled || !this.client) {
      throw new Error('El asistente IA está desactivado. Activalo con ASSISTANT_ENABLED=true en el archivo .env.');
    }

    // Get or create conversation
    let conversation: any;
    if (conversationId) {
      conversation = await this.prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50,
          },
        },
      });
      if (!conversation) throw new Error('Conversation not found');
    } else {
      conversation = await this.prisma.assistantConversation.create({
        data: { userId },
        include: { messages: true },
      });
    }

    yield { type: 'conversation_id', data: { conversationId: conversation.id } };

    // Build history
    const history: Anthropic.MessageParam[] = conversation.messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: message });

    // Save user message
    await this.prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: message },
    });

    // Tool use loop with streaming
    let currentMessages = [...history];
    let fullResponse = '';
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages: currentMessages,
      });

      let toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      let textContent = '';

      // Collect the full response
      const finalMessage = await stream.finalMessage();

      for (const block of finalMessage.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // Stream text chunks if we have text
      if (textContent && finalMessage.stop_reason !== 'tool_use') {
        // Stream word by word for a nice effect
        const words = textContent.split(' ');
        for (let w = 0; w < words.length; w++) {
          const chunk = w === 0 ? words[w] : ' ' + words[w];
          yield { type: 'text_delta', data: { text: chunk } };
        }
        fullResponse += textContent;
      }

      if (finalMessage.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        // Notify about tool usage
        for (const toolUse of toolUseBlocks) {
          yield { type: 'tool_use', data: { tool: toolUse.name } };
        }

        // Execute tools
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId,
            this.prisma,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Continue the loop
        currentMessages.push({ role: 'assistant', content: finalMessage.content });
        currentMessages.push({ role: 'user', content: toolResults });
      } else {
        // Done
        break;
      }
    }

    // Save response
    if (fullResponse) {
      await this.prisma.assistantMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: fullResponse,
        },
      });
    }

    // Auto-title
    if (!conversation.title && message.length > 0) {
      const title = message.length > 60 ? message.substring(0, 57) + '...' : message;
      await this.prisma.assistantConversation.update({
        where: { id: conversation.id },
        data: { title },
      });
    }

    yield { type: 'done', data: {} };
  }
}
