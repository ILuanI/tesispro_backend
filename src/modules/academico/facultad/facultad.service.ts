import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Facultad } from '../../../entities/facultad.entity.js';

@Injectable()
export class FacultadService {
  constructor(
    @InjectRepository(Facultad)
    private readonly repository: Repository<Facultad>,
  ) {}

  findAll(): Promise<Facultad[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Facultad> {
    const entity = await this.repository.findOne({
      where: { idFacultad: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Facultad con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Facultad>): Promise<Facultad> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Facultad>): Promise<Facultad> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idFacultad: id } as never);
  }
}
