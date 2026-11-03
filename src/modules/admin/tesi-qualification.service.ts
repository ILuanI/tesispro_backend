import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntityManager } from 'typeorm';
import { PackagesService } from './packages.service.js';

const levels = ['intencion_contratacion', 'alto', 'medio', 'bajo'];
const signals = ['intencion_contratar', 'consulta_precio', 'consulta_modalidad', 'consulta_plazo', 'consulta_propuesta', 'necesidad', 'solicita_asesor'];
type Evidence = { idMensaje: string; fragmento: string };
type Item = { valor: string | boolean; evidencias: Evidence[]; tipo?: string };
type Interpretation = { campos: Record<string, Item>; senales: Record<string, Item> };

@Injectable()
export class TesiQualificationService {
  private config: any;
  private version = '';
  constructor(private readonly packages: PackagesService) {
    try {
      const raw = readFileSync(process.env.R7_RULES_FILE || resolve(process.cwd(), 'config/tesi-qualification.json'), 'utf8');
      const cfg = JSON.parse(raw);
      if (!Array.isArray(cfg.prioridad) || cfg.prioridad.length !== 4 || new Set(cfg.prioridad).size !== 4 || cfg.prioridad.some((x: string) => !levels.includes(x)) || cfg.prioridad[0] !== 'intencion_contratacion' || !cfg.niveles || levels.some(level => !Array.isArray(cfg.niveles[level]) || cfg.niveles[level].some((x: string) => !signals.includes(x))) || JSON.stringify(cfg.recomendacionRequiere) !== JSON.stringify(['necesidad', 'etapa'])) throw new Error('Reglas inválidas');
      if (!cfg.niveles.intencion_contratacion.includes('intencion_contratar') || cfg.niveles.bajo.length || cfg.niveles.intencion_contratacion.some((x: string) => x !== 'intencion_contratar')) throw new Error('Prioridad de contratación inválida');
      this.config = cfg;
      this.version = createHash('sha256').update(JSON.stringify(cfg)).digest('hex');
    } catch (error) {
      console.error('No se pudo cargar la configuración de clasificación de Tesi:', error instanceof Error ? error.message : 'error');
    }
  }
  async evaluate(m: EntityManager, conversation: string, turn: string, lead: string | null, buyer: string | null, incoming: Interpretation, packageVersion?: number | null) {
    if (!this.config) throw new ServiceUnavailableException('Configuración de clasificación de Tesi inválida.');
    if (!incoming || typeof incoming.campos !== 'object' || typeof incoming.senales !== 'object') throw new BadRequestException('Interpretación inválida.');
    if (!Object.keys(incoming.campos).length && !Object.keys(incoming.senales).length) throw new BadRequestException('No hay evidencia para clasificar.');
    const [prior] = await m.query('SELECT resultado FROM calificacion_tesi WHERE id_conversacion=$1 ORDER BY id_calificacion DESC LIMIT 1', [conversation]);
    const campos = { ...(prior?.resultado?.campos || {}) }, senales = { ...(prior?.resultado?.senales || {}) };
    for (const [group, allowed, target] of [[incoming.campos, ['necesidad', 'etapa', 'urgencia', 'servicio'], campos], [incoming.senales, signals, senales]] as const) {
      for (const [key, item] of Object.entries(group)) {
        if (!(allowed as readonly string[]).includes(key) || !item || !Array.isArray(item.evidencias) || !item.evidencias.length || item.evidencias.length > 5 || (group === incoming.campos ? typeof item.valor !== 'string' : typeof item.valor !== 'boolean') || (typeof item.valor === 'string' && (!item.valor.trim() || item.valor.length > 300))) throw new BadRequestException('Interpretación o evidencia inválida.');
        for (const evidence of item.evidencias) {
          if (!evidence || !/^[1-9]\d*$/.test(String(evidence.idMensaje)) || typeof evidence.fragmento !== 'string' || !evidence.fragmento.trim() || evidence.fragmento.length > 1000) throw new BadRequestException('Evidencia inválida.');
          const [message] = await m.query("SELECT contenido FROM mensaje WHERE id_mensaje=$1 AND id_conversacion=$2 AND remitente='lead'", [evidence.idMensaje, conversation]);
          if (!message || !message.contenido.includes(evidence.fragmento)) throw new BadRequestException('La evidencia no corresponde a un mensaje del visitante.');
        }
        let tipo = 'inferido';
        if (item.tipo === 'confirmado') {
          const [current] = await m.query("SELECT m.id_mensaje,m.contenido FROM turno_tesi t JOIN mensaje m USING(id_mensaje) WHERE t.id_turno=$1 AND t.id_conversacion=$2 AND m.remitente='lead'", [turn, conversation]);
          if (group !== incoming.campos || key !== 'necesidad' || !prior?.resultado?.campos?.necesidad || prior.resultado.campos.necesidad.valor !== item.valor || current?.contenido !== `Confirmo: ${item.valor}` || !item.evidencias.some(e => String(e.idMensaje) === String(current.id_mensaje) && e.fragmento === current.contenido)) throw new BadRequestException('Confirmación inválida.');
          tipo = 'confirmado';
        } else if (item.tipo && item.tipo !== 'inferido') throw new BadRequestException('Procedencia inválida.');
        target[key] = { ...item, tipo };
      }
    }
    const active = Object.keys(senales).filter(key => senales[key].valor === true);
    if (campos.necesidad && !active.includes('necesidad')) active.push('necesidad');
    const nivel = this.config.prioridad.find((level: string) => this.config.niveles[level].some((signal: string) => active.includes(signal))) || 'bajo';
    const suficiente = !!campos.necesidad && !!campos.etapa;
    let servicio: string | null = null;
    if (suficiente && typeof campos.servicio?.valor === 'string') {
      const packageId = /^paquete-([1-9]\d*)$/.exec(campos.servicio.valor);
      if (packageId && Number.isSafeInteger(Number(packageId[1])) && Number.isInteger(packageVersion) && Number(packageVersion) > 0) {
        try {
          await this.packages.forProposal(m, Number(packageId[1]), Number(packageVersion));
          servicio = campos.servicio.valor;
        } catch (error) {
          if (!(error instanceof Error) || error.name !== 'ConflictException') throw error;
        }
      } else if (!packageId) {
        const [found] = await m.query('SELECT codigo FROM servicio WHERE codigo=$1 AND activo=true', [campos.servicio.valor]);
        servicio = found?.codigo || null;
      }
    }
    const resultado = { esquema: 1, nivel, campos, senales, motivos: active, suficiente, servicio, versionReglas: this.version };
    await m.query('INSERT INTO calificacion_tesi(id_conversacion,id_turno,id_lead,id_buyer,resultado,version_reglas) VALUES($1,$2,$3,$4,$5::jsonb,$6)', [conversation, turn, lead, buyer, JSON.stringify(resultado), this.version]);
    if (incoming.senales.solicita_asesor?.valor === true || incoming.senales.intencion_contratar?.valor === true) {
      const reason = incoming.senales.intencion_contratar?.valor === true ? 'Intención de contratación' : 'Solicitud de asesor';
      const evidence = incoming.senales.intencion_contratar?.valor === true ? incoming.senales.intencion_contratar.evidencias : incoming.senales.solicita_asesor.evidencias;
      await m.query("INSERT INTO derivacion_humana(id_conversacion,id_lead,motivo,evidencia) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT (id_conversacion) WHERE estado IN ('pendiente','en_atencion') DO NOTHING", [conversation, lead, reason, JSON.stringify(evidence)]);
    }
    return resultado;
  }
}
