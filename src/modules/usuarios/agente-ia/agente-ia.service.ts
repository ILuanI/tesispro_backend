import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgenteIa } from '../../../entities/agente-ia.entity.js';

@Injectable()
export class AgenteIaService {
  constructor(
    @InjectRepository(AgenteIa)
    private readonly repository: Repository<AgenteIa>,
  ) {}

  findAll(): Promise<AgenteIa[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<AgenteIa> {
    const entity = await this.repository.findOne({
      where: { idAgente: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`AgenteIa con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<AgenteIa>): Promise<AgenteIa> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<AgenteIa>): Promise<AgenteIa> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idAgente: id } as never);
  }
}
