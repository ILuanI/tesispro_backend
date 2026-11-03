import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Servicio } from '../../../entities/servicio.entity.js';

@Injectable()
export class ServicioService {
  constructor(
    @InjectRepository(Servicio)
    private readonly repository: Repository<Servicio>,
  ) {}

  findAll(): Promise<Servicio[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Servicio> {
    const entity = await this.repository.findOne({
      where: { idServicio: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Servicio con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Servicio>): Promise<Servicio> {
    this.legacyFields(data);
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(
    id: number | string,
    data: Partial<Servicio>,
  ): Promise<Servicio> {
    this.legacyFields(data);
    const entity = await this.findOne(id);
    if (await this.isPackage(id))
      throw new ForbiddenException(
        'Gestiona los paquetes desde el catálogo administrativo para conservar sus versiones.',
      );
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    if (await this.isPackage(id))
      throw new ForbiddenException(
        'Los paquetes se desactivan; no se elimina su historia comercial.',
      );
    await this.repository.delete({ idServicio: id } as never);
  }
  private legacyFields(data: Partial<Servicio>) {
    const allowed = [
      'codigo',
      'nombre',
      'descripcion',
      'idGrado',
      'modeloCobro',
      'modalidad',
      'alcance',
      'duracionDias',
      'precioBase',
      'moneda',
      'incluyeControlSimilitud',
      'activo',
    ];
    if (!data || Object.keys(data).some((key) => !allowed.includes(key)))
      throw new ForbiddenException(
        'Campos de catálogo no permitidos en el CRUD de servicios.',
      );
  }
  private async isPackage(id: number | string) {
    const [old] = await this.repository.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='paquete' AND column_name='id_servicio') AS present`,
    );
    if (old.present)
      return (
        (
          await this.repository.query(
            'SELECT 1 FROM paquete WHERE id_servicio=$1',
            [id],
          )
        ).length > 0
      );
    const [row] = await this.repository.query(
      `SELECT (to_jsonb(s) @> '{"es_paquete":true}'::jsonb) AS paquete FROM servicio s WHERE id_servicio=$1`,
      [id],
    );
    return row?.paquete === true;
  }
}
