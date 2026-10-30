import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioInterno } from '../../../entities/usuario-interno.entity.js';

@Injectable()
export class UsuarioInternoService {
  constructor(
    @InjectRepository(UsuarioInterno)
    private readonly repository: Repository<UsuarioInterno>,
  ) {}

  findAll(): Promise<UsuarioInterno[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<UsuarioInterno> {
    const entity = await this.repository.findOne({
      where: { idUsuario: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`UsuarioInterno con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<UsuarioInterno>): Promise<UsuarioInterno> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<UsuarioInterno>): Promise<UsuarioInterno> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idUsuario: id } as never);
  }
}
