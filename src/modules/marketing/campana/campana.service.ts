import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campana } from '../../../entities/campana.entity.js';

@Injectable()
export class CampanaService {
  constructor(
    @InjectRepository(Campana)
    private readonly repository: Repository<Campana>,
  ) {}

  findAll(): Promise<Campana[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Campana> {
    const entity = await this.repository.findOne({
      where: { idCampana: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Campana con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Campana>): Promise<Campana> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Campana>): Promise<Campana> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idCampana: id } as never);
  }
}
