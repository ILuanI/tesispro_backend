import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SesionLanding } from '../../../entities/sesion-landing.entity.js';

@Injectable()
export class SesionLandingService {
  constructor(
    @InjectRepository(SesionLanding)
    private readonly repository: Repository<SesionLanding>,
  ) {}

  findAll(): Promise<SesionLanding[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<SesionLanding> {
    const entity = await this.repository.findOne({
      where: { idSesion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`SesionLanding con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<SesionLanding>): Promise<SesionLanding> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<SesionLanding>): Promise<SesionLanding> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idSesion: id } as never);
  }
}
