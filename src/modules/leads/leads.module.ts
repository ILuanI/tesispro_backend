import { Module } from '@nestjs/common';
import { EstadoLeadModule } from './estado-lead/estado-lead.module.js';
import { LeadModule } from './lead/lead.module.js';
import { EnlaceReferidoModule } from './enlace-referido/enlace-referido.module.js';
import { LeadEstadoHistorialModule } from './lead-estado-historial/lead-estado-historial.module.js';
import { PerfilAcademicoModule } from './perfil-academico/perfil-academico.module.js';
import { PerfilLaboralModule } from './perfil-laboral/perfil-laboral.module.js';
import { ConsentimientoDatosModule } from './consentimiento-datos/consentimiento-datos.module.js';

@Module({
  imports: [
    EstadoLeadModule,
    LeadModule,
    EnlaceReferidoModule,
    LeadEstadoHistorialModule,
    PerfilAcademicoModule,
    PerfilLaboralModule,
    ConsentimientoDatosModule,
  ],
  exports: [
    EstadoLeadModule,
    LeadModule,
    EnlaceReferidoModule,
    LeadEstadoHistorialModule,
    PerfilAcademicoModule,
    PerfilLaboralModule,
    ConsentimientoDatosModule,
  ],
})
export class LeadsModule {}
