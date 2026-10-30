import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../../../entities/cliente.entity.js';

@Injectable()
export class ClienteService {
  constructor(
    @InjectRepository(Cliente)
    private readonly repository: Repository<Cliente>,
  ) {}

  findAll(): Promise<Cliente[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Cliente> {
    const entity = await this.repository.findOne({
      where: { idCliente: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Cliente con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Cliente>): Promise<Cliente> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Cliente>): Promise<Cliente> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idCliente: id } as never);
  }
}
