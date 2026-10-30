import { Module } from '@nestjs/common';
import { ServicioModule } from './servicio/servicio.module.js';
import { ProyectoTesisModule } from './proyecto-tesis/proyecto-tesis.module.js';
import { ProyectoNecesidadModule } from './proyecto-necesidad/proyecto-necesidad.module.js';
import { DescargaRecursoModule } from './descarga-recurso/descarga-recurso.module.js';

@Module({
  imports: [
    ServicioModule,
    ProyectoTesisModule,
    ProyectoNecesidadModule,
    DescargaRecursoModule,
  ],
  exports: [
    ServicioModule,
    ProyectoTesisModule,
    ProyectoNecesidadModule,
    DescargaRecursoModule,
  ],
})
export class ProyectosModule {}
