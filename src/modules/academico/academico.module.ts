import { Module } from '@nestjs/common';
import { UniversidadModule } from './universidad/universidad.module.js';
import { FacultadModule } from './facultad/facultad.module.js';
import { GradoAcademicoModule } from './grado-academico/grado-academico.module.js';
import { ProgramaAcademicoModule } from './programa-academico/programa-academico.module.js';
import { DirectivaTesisModule } from './directiva-tesis/directiva-tesis.module.js';
import { EtapaTesisModule } from './etapa-tesis/etapa-tesis.module.js';
import { NecesidadAcademicaModule } from './necesidad-academica/necesidad-academica.module.js';

@Module({
  imports: [
    UniversidadModule,
    FacultadModule,
    GradoAcademicoModule,
    ProgramaAcademicoModule,
    DirectivaTesisModule,
    EtapaTesisModule,
    NecesidadAcademicaModule,
  ],
  exports: [
    UniversidadModule,
    FacultadModule,
    GradoAcademicoModule,
    ProgramaAcademicoModule,
    DirectivaTesisModule,
    EtapaTesisModule,
    NecesidadAcademicaModule,
  ],
})
export class AcademicoModule {}
