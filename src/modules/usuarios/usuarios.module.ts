import { Module } from '@nestjs/common';
import { UsuarioInternoModule } from './usuario-interno/usuario-interno.module.js';
import { AgenteIaModule } from './agente-ia/agente-ia.module.js';

@Module({
  imports: [
    UsuarioInternoModule,
    AgenteIaModule,
  ],
  exports: [
    UsuarioInternoModule,
    AgenteIaModule,
  ],
})
export class UsuariosModule {}
