import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NecesidadAcademica } from '../../../entities/necesidad-academica.entity.js';

@Injectable()
export class NecesidadAcademicaService {
  constructor(
    @InjectRepository(NecesidadAcademica)
    private readonly repository: Repository<NecesidadAcademica>,
  ) {}

  findAll(): Promise<NecesidadAcademica[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<NecesidadAcademica> {
    const entity = await this.repository.findOne({
      where: { idNecesidad: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`NecesidadAcademica con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<NecesidadAcademica>): Promise<NecesidadAcademica> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<NecesidadAcademica>): Promise<NecesidadAcademica> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idNecesidad: id } as never);
  }
}
