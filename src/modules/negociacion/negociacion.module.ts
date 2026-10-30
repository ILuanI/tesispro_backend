import { Module } from '@nestjs/common';
import { PropuestaModule } from './propuesta/propuesta.module.js';
import { PropuestaDetalleModule } from './propuesta-detalle/propuesta-detalle.module.js';
import { ObjecionModule } from './objecion/objecion.module.js';
import { LeadObjecionModule } from './lead-objecion/lead-objecion.module.js';
import { SeguimientoModule } from './seguimiento/seguimiento.module.js';
import { ContratoModule } from './contrato/contrato.module.js';
import { PagoModule } from './pago/pago.module.js';
import { ClienteModule } from './cliente/cliente.module.js';

@Module({
  imports: [
    PropuestaModule,
    PropuestaDetalleModule,
    ObjecionModule,
    LeadObjecionModule,
    SeguimientoModule,
    ContratoModule,
    PagoModule,
    ClienteModule,
  ],
  exports: [
    PropuestaModule,
    PropuestaDetalleModule,
    ObjecionModule,
    LeadObjecionModule,
    SeguimientoModule,
    ContratoModule,
    PagoModule,
    ClienteModule,
  ],
})
export class NegociacionModule {}
