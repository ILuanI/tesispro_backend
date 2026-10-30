import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plataforma } from '../../../entities/plataforma.entity.js';

@Injectable()
export class PlataformaService {
  constructor(
    @InjectRepository(Plataforma)
    private readonly repository: Repository<Plataforma>,
  ) {}

  findAll(): Promise<Plataforma[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Plataforma> {
    const entity = await this.repository.findOne({
      where: { idPlataforma: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Plataforma con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Plataforma>): Promise<Plataforma> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Plataforma>): Promise<Plataforma> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPlataforma: id } as never);
  }
}
