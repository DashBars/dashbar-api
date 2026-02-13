import { IsArray, IsEmail, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class SendReportEmailDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Se requiere al menos un destinatario' })
  @ArrayMaxSize(10, { message: 'Máximo 10 destinatarios por envío' })
  @IsEmail({}, { each: true, message: 'Todos los destinatarios deben ser emails válidos' })
  recipients: string[];
}
