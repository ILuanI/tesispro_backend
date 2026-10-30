import { Module } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module.js';
import { MensajeModule } from './mensaje/mensaje.module.js';
import { DerivacionHumanaModule } from './derivacion-humana/derivacion-humana.module.js';

@Module({
  imports: [
    ConversacionModule,
    MensajeModule,
    DerivacionHumanaModule,
  ],
  exports: [
    ConversacionModule,
    MensajeModule,
    DerivacionHumanaModule,
  ],
})
export class ConversacionesModule {}
