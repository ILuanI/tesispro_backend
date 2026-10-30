import { Module } from '@nestjs/common';
import { PlataformaModule } from './plataforma/plataforma.module.js';
import { CuentaRedSocialModule } from './cuenta-red-social/cuenta-red-social.module.js';
import { CampanaModule } from './campana/campana.module.js';
import { ConceptoVisualModule } from './concepto-visual/concepto-visual.module.js';
import { PublicacionModule } from './publicacion/publicacion.module.js';
import { ConvenioInstitucionalModule } from './convenio-institucional/convenio-institucional.module.js';
import { RecursoGratuitoModule } from './recurso-gratuito/recurso-gratuito.module.js';
import { SesionLandingModule } from './sesion-landing/sesion-landing.module.js';

@Module({
  imports: [
    PlataformaModule,
    CuentaRedSocialModule,
    CampanaModule,
    ConceptoVisualModule,
    PublicacionModule,
    ConvenioInstitucionalModule,
    RecursoGratuitoModule,
    SesionLandingModule,
  ],
  exports: [
    PlataformaModule,
    CuentaRedSocialModule,
    CampanaModule,
    ConceptoVisualModule,
    PublicacionModule,
    ConvenioInstitucionalModule,
    RecursoGratuitoModule,
    SesionLandingModule,
  ],
})
export class MarketingModule {}
