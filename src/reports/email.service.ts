import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import * as fs from 'fs';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email service initialized');
    } else {
      this.resend = null;
      this.logger.warn('RESEND_API_KEY not set — email sending disabled');
    }
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'reportes@dashbar.app';
  }

  isEnabled(): boolean {
    return this.resend !== null;
  }

  async sendReportEmail(
    recipients: string[],
    eventName: string,
    pdfPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.resend) {
      return { success: false, error: 'El servicio de email no está configurado (falta RESEND_API_KEY)' };
    }

    if (recipients.length === 0) {
      return { success: false, error: 'No se especificaron destinatarios' };
    }

    // Read PDF file
    if (!fs.existsSync(pdfPath)) {
      return { success: false, error: 'El archivo PDF del reporte no existe. Intentá descargarlo primero.' };
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileName = `reporte_${eventName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipients,
        subject: `Reporte del evento: ${eventName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Reporte del evento: ${eventName}</h2>
            <p style="color: #666; line-height: 1.6;">
              Se adjunta el reporte en formato PDF del evento <strong>${eventName}</strong>.
            </p>
            <p style="color: #666; line-height: 1.6;">
              El reporte incluye resumen ejecutivo, productos más vendidos, horas pico,
              desglose por barra y terminal POS, y valuación de stock restante.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">
              Este email fue enviado desde Dashbar. No respondas a este mensaje.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: fileName,
            content: pdfBuffer,
          },
        ],
      });

      if (error) {
        this.logger.error(`Resend error: ${JSON.stringify(error)}`);
        return { success: false, error: error.message || 'Error al enviar el email' };
      }

      this.logger.log(`Report email sent successfully to ${recipients.join(', ')} (id: ${data?.id})`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Email send failed: ${err.message}`);
      return { success: false, error: err.message || 'Error inesperado al enviar el email' };
    }
  }
}
