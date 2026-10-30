import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src');

const resources = [
  { slug: 'universidad', className: 'Universidad', table: 'universidad', pk: 'idUniversidad', pkCol: 'id_universidad', domain: 'academico' },
  { slug: 'facultad', className: 'Facultad', table: 'facultad', pk: 'idFacultad', pkCol: 'id_facultad', domain: 'academico' },
  { slug: 'grado-academico', className: 'GradoAcademico', table: 'grado_academico', pk: 'idGrado', pkCol: 'id_grado', domain: 'academico' },
  { slug: 'programa-academico', className: 'ProgramaAcademico', table: 'programa_academico', pk: 'idPrograma', pkCol: 'id_programa', domain: 'academico' },
  { slug: 'directiva-tesis', className: 'DirectivaTesis', table: 'directiva_tesis', pk: 'idDirectiva', pkCol: 'id_directiva', domain: 'academico' },
  { slug: 'etapa-tesis', className: 'EtapaTesis', table: 'etapa_tesis', pk: 'idEtapa', pkCol: 'id_etapa', domain: 'academico' },
  { slug: 'necesidad-academica', className: 'NecesidadAcademica', table: 'necesidad_academica', pk: 'idNecesidad', pkCol: 'id_necesidad', domain: 'academico' },
  { slug: 'usuario-interno', className: 'UsuarioInterno', table: 'usuario_interno', pk: 'idUsuario', pkCol: 'id_usuario', domain: 'usuarios' },
  { slug: 'agente-ia', className: 'AgenteIa', table: 'agente_ia', pk: 'idAgente', pkCol: 'id_agente', domain: 'usuarios' },
  { slug: 'plataforma', className: 'Plataforma', table: 'plataforma', pk: 'idPlataforma', pkCol: 'id_plataforma', domain: 'marketing' },
  { slug: 'cuenta-red-social', className: 'CuentaRedSocial', table: 'cuenta_red_social', pk: 'idCuenta', pkCol: 'id_cuenta', domain: 'marketing' },
  { slug: 'campana', className: 'Campana', table: 'campana', pk: 'idCampana', pkCol: 'id_campana', domain: 'marketing' },
  { slug: 'concepto-visual', className: 'ConceptoVisual', table: 'concepto_visual', pk: 'idConcepto', pkCol: 'id_concepto', domain: 'marketing' },
  { slug: 'publicacion', className: 'Publicacion', table: 'publicacion', pk: 'idPublicacion', pkCol: 'id_publicacion', domain: 'marketing' },
  { slug: 'convenio-institucional', className: 'ConvenioInstitucional', table: 'convenio_institucional', pk: 'idConvenio', pkCol: 'id_convenio', domain: 'marketing' },
  { slug: 'recurso-gratuito', className: 'RecursoGratuito', table: 'recurso_gratuito', pk: 'idRecurso', pkCol: 'id_recurso', domain: 'marketing' },
  { slug: 'sesion-landing', className: 'SesionLanding', table: 'sesion_landing', pk: 'idSesion', pkCol: 'id_sesion', domain: 'marketing' },
  { slug: 'estado-lead', className: 'EstadoLead', table: 'estado_lead', pk: 'idEstado', pkCol: 'id_estado', domain: 'leads' },
  { slug: 'lead', className: 'Lead', table: 'lead', pk: 'idLead', pkCol: 'id_lead', domain: 'leads' },
  { slug: 'enlace-referido', className: 'EnlaceReferido', table: 'enlace_referido', pk: 'idReferido', pkCol: 'id_referido', domain: 'leads' },
  { slug: 'lead-estado-historial', className: 'LeadEstadoHistorial', table: 'lead_estado_historial', pk: 'idHistorial', pkCol: 'id_historial', domain: 'leads' },
  { slug: 'perfil-academico', className: 'PerfilAcademico', table: 'perfil_academico', pk: 'idPerfil', pkCol: 'id_perfil', domain: 'leads' },
  { slug: 'perfil-laboral', className: 'PerfilLaboral', table: 'perfil_laboral', pk: 'idPerfilLaboral', pkCol: 'id_perfil_laboral', domain: 'leads' },
  { slug: 'consentimiento-datos', className: 'ConsentimientoDatos', table: 'consentimiento_datos', pk: 'idConsentimiento', pkCol: 'id_consentimiento', domain: 'leads' },
  { slug: 'servicio', className: 'Servicio', table: 'servicio', pk: 'idServicio', pkCol: 'id_servicio', domain: 'proyectos' },
  { slug: 'proyecto-tesis', className: 'ProyectoTesis', table: 'proyecto_tesis', pk: 'idProyecto', pkCol: 'id_proyecto', domain: 'proyectos' },
  { slug: 'proyecto-necesidad', className: 'ProyectoNecesidad', table: 'proyecto_necesidad', pk: 'idProyecto', pkCol: 'id_proyecto', domain: 'proyectos', compositePk: true },
  { slug: 'descarga-recurso', className: 'DescargaRecurso', table: 'descarga_recurso', pk: 'idDescarga', pkCol: 'id_descarga', domain: 'proyectos' },
  { slug: 'conversacion', className: 'Conversacion', table: 'conversacion', pk: 'idConversacion', pkCol: 'id_conversacion', domain: 'conversaciones' },
  { slug: 'mensaje', className: 'Mensaje', table: 'mensaje', pk: 'idMensaje', pkCol: 'id_mensaje', domain: 'conversaciones' },
  { slug: 'derivacion-humana', className: 'DerivacionHumana', table: 'derivacion_humana', pk: 'idDerivacion', pkCol: 'id_derivacion', domain: 'conversaciones' },
  { slug: 'propuesta', className: 'Propuesta', table: 'propuesta', pk: 'idPropuesta', pkCol: 'id_propuesta', domain: 'negociacion' },
  { slug: 'propuesta-detalle', className: 'PropuestaDetalle', table: 'propuesta_detalle', pk: 'idDetalle', pkCol: 'id_detalle', domain: 'negociacion' },
  { slug: 'objecion', className: 'Objecion', table: 'objecion', pk: 'idObjecion', pkCol: 'id_objecion', domain: 'negociacion' },
  { slug: 'lead-objecion', className: 'LeadObjecion', table: 'lead_objecion', pk: 'idLeadObjecion', pkCol: 'id_lead_objecion', domain: 'negociacion' },
  { slug: 'seguimiento', className: 'Seguimiento', table: 'seguimiento', pk: 'idSeguimiento', pkCol: 'id_seguimiento', domain: 'negociacion' },
  { slug: 'contrato', className: 'Contrato', table: 'contrato', pk: 'idContrato', pkCol: 'id_contrato', domain: 'negociacion' },
  { slug: 'pago', className: 'Pago', table: 'pago', pk: 'idPago', pkCol: 'id_pago', domain: 'negociacion' },
  { slug: 'cliente', className: 'Cliente', table: 'cliente', pk: 'idCliente', pkCol: 'id_cliente', domain: 'negociacion' },
  { slug: 'kpi-definicion', className: 'KpiDefinicion', table: 'kpi_definicion', pk: 'idKpi', pkCol: 'id_kpi', domain: 'kpis' },
  { slug: 'kpi-medicion', className: 'KpiMedicion', table: 'kpi_medicion', pk: 'idMedicion', pkCol: 'id_medicion', domain: 'kpis' },
];

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function write(path, content) {
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf8');
}

for (const r of resources) {
  const moduleDir = join(src, 'modules', r.domain, r.slug);
  const entityImport = `../../entities/${r.slug.replace(/-/g, '-')}.entity.js`;
  const entityPath = join(src, 'entities', `${r.slug}.entity.ts`);
  const entityImportFromModule = `../../../entities/${r.slug}.entity.js`;

  const serviceContent = `import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${r.className} } from '${entityImportFromModule}';

@Injectable()
export class ${r.className}Service {
  constructor(
    @InjectRepository(${r.className})
    private readonly repository: Repository<${r.className}>,
  ) {}

  findAll(): Promise<${r.className}[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<${r.className}> {
    const entity = await this.repository.findOne({
      where: { ${r.pk}: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(\`${r.className} con id \${id} no encontrado\`);
    }
    return entity;
  }

  create(data: Partial<${r.className}>): Promise<${r.className}> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<${r.className}>): Promise<${r.className}> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ ${r.pk}: id } as never);
  }
}
`;

  const controllerContent = `import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ${r.className} } from '${entityImportFromModule}';
import { ${r.className}Service } from './${r.slug}.service.js';

@Controller('${r.slug}')
export class ${r.className}Controller {
  constructor(private readonly ${r.className.charAt(0).toLowerCase() + r.className.slice(1)}Service: ${r.className}Service) {}

  @Get()
  findAll(): Promise<${r.className}[]> {
    return this.${r.className.charAt(0).toLowerCase() + r.className.slice(1)}Service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<${r.className}> {
    return this.${r.className.charAt(0).toLowerCase() + r.className.slice(1)}Service.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<${r.className}>): Promise<${r.className}> {
    return this.${r.className.charAt(0).toLowerCase() + r.className.slice(1)}Service.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<${r.className}>,
  ): Promise<${r.className}> {
    return this.${r.className.charAt(0).toLowerCase() + r.className.slice(1)}Service.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.${r.className.charAt(0).toLowerCase() + r.className.slice(1)}Service.remove(id);
  }
}
`;

  const moduleContent = `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${r.className} } from '${entityImportFromModule}';
import { ${r.className}Controller } from './${r.slug}.controller.js';
import { ${r.className}Service } from './${r.slug}.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([${r.className}])],
  controllers: [${r.className}Controller],
  providers: [${r.className}Service],
  exports: [${r.className}Service],
})
export class ${r.className}Module {}
`;

  write(join(moduleDir, `${r.slug}.service.ts`), serviceContent);
  write(join(moduleDir, `${r.slug}.controller.ts`), controllerContent);
  write(join(moduleDir, `${r.slug}.module.ts`), moduleContent);
}

const domains = [...new Set(resources.map((r) => r.domain))];
for (const domain of domains) {
  const domainResources = resources.filter((r) => r.domain === domain);
  const imports = domainResources
    .map(
      (r) =>
        `import { ${r.className}Module } from './${r.slug}/${r.slug}.module.js';`,
    )
    .join('\n');
  const moduleImports = domainResources.map((r) => `${r.className}Module`).join(',\n    ');
  const className = domain.charAt(0).toUpperCase() + domain.slice(1) + 'Module';

  const domainModuleContent = `import { Module } from '@nestjs/common';
${imports}

@Module({
  imports: [
    ${moduleImports},
  ],
  exports: [
    ${moduleImports},
  ],
})
export class ${className} {}
`;

  write(join(src, 'modules', domain, `${domain}.module.ts`), domainModuleContent);
}

console.log(`Generated ${resources.length} resource modules in ${domains.length} domains.`);
