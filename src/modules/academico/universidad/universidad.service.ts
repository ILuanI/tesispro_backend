import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Universidad } from '../../../entities/universidad.entity.js';

@Injectable()
export class UniversidadService {
  constructor(
    @InjectRepository(Universidad)
    private readonly repository: Repository<Universidad>,
  ) {}

  findAll(): Promise<Universidad[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Universidad> {
    const entity = await this.repository.findOne({
      where: { idUniversidad: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Universidad con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Universidad>): Promise<Universidad> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Universidad>): Promise<Universidad> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idUniversidad: id } as never);
  }
}
