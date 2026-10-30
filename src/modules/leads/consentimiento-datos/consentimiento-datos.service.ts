import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentimientoDatos } from '../../../entities/consentimiento-datos.entity.js';

@Injectable()
export class ConsentimientoDatosService {
  constructor(
    @InjectRepository(ConsentimientoDatos)
    private readonly repository: Repository<ConsentimientoDatos>,
  ) {}

  findAll(): Promise<ConsentimientoDatos[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<ConsentimientoDatos> {
    const entity = await this.repository.findOne({
      where: { idConsentimiento: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`ConsentimientoDatos con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<ConsentimientoDatos>): Promise<ConsentimientoDatos> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<ConsentimientoDatos>): Promise<ConsentimientoDatos> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idConsentimiento: id } as never);
  }
}
