import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Publicacion } from '../../../entities/publicacion.entity.js';

@Injectable()
export class PublicacionService {
  constructor(
    @InjectRepository(Publicacion)
    private readonly repository: Repository<Publicacion>,
  ) {}

  findAll(): Promise<Publicacion[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Publicacion> {
    const entity = await this.repository.findOne({
      where: { idPublicacion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Publicacion con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Publicacion>): Promise<Publicacion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Publicacion>): Promise<Publicacion> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPublicacion: id } as never);
  }
}
