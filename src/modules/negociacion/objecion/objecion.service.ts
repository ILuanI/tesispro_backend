import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Objecion } from '../../../entities/objecion.entity.js';

@Injectable()
export class ObjecionService {
  constructor(
    @InjectRepository(Objecion)
    private readonly repository: Repository<Objecion>,
  ) {}

  findAll(): Promise<Objecion[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Objecion> {
    const entity = await this.repository.findOne({
      where: { idObjecion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Objecion con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Objecion>): Promise<Objecion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Objecion>): Promise<Objecion> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idObjecion: id } as never);
  }
}
