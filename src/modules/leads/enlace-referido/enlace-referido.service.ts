import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnlaceReferido } from '../../../entities/enlace-referido.entity.js';

@Injectable()
export class EnlaceReferidoService {
  constructor(
    @InjectRepository(EnlaceReferido)
    private readonly repository: Repository<EnlaceReferido>,
  ) {}

  findAll(): Promise<EnlaceReferido[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<EnlaceReferido> {
    const entity = await this.repository.findOne({
      where: { idReferido: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`EnlaceReferido con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<EnlaceReferido>): Promise<EnlaceReferido> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<EnlaceReferido>): Promise<EnlaceReferido> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idReferido: id } as never);
  }
}
